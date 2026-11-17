import React, { Component } from 'react'
import 'chart.js/auto'
import { Chart } from 'react-chartjs-2'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials'
import { apiURL } from './config'
import beautify from 'js-beautify'
import { withRouter } from 'react-router-dom'
import AdminDatabaseReset from './AdminDatabaseReset'
import './Admin.css'
import './AdminJobs.css'
import AdminTabs from './AdminTabs.js'
import { previewJSON, summariseRadiatorData } from './radiatorData'

const L = require('partial.lenses')
const R = require('ramda')

// Typing in the lens or config box redraws the chart once typing pauses for this long, not on every keystroke.
const CHART_UPDATE_DELAY_MS = 300

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '—')

const downloadJSON = (data, fileName) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

class Admin extends Component {
  updateName(e) {
    this.setState({ name: e.target.value })
  }

  constructor(props) {
    super(props)
    this.state = {
      loading: true,
      data: [],
      dataVisible: false,
      chartData: { datasets: [], labels: [] },
      chartDataVisible: false,
      collectDataVisible: false,
      visualisations: window.localStorage.getItem('visualisations') || '[]',
      lens: window.localStorage.getItem('lens') || '[]',
      lensVisible: true,
      collectOutput: [],
      configVisible: false,
      configs: [],
      config:
        window.localStorage.getItem('config') ||
        JSON.stringify(
          {
            type: 'line',
            data: [],
            options: {
              responsive: true,
              labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange'],
              plugins: {
                legend: {
                  position: 'top',
                },
                title: {
                  display: true,
                  text: 'Chart.js Line Chart',
                },
              },
            },
          },
          null,
          2,
        ),
    }
  }

  async updateRadiatorData() {
    this.setState({ loading: true })
    const data = await requestJSONwithCredentials({ url: `${apiURL}/admin/radiator` })
    const configs = await requestJSONwithCredentials({ url: `${apiURL}/admin/radiator/config` })
    this.setState({
      data,
      configs,
      loading: false,
    })
  }

  async componentDidMount() {
    await this.updateRadiatorData()
    this.updateChart()
  }

  componentWillUnmount() {
    clearTimeout(this.chartUpdateTimeout)
  }

  scheduleChartUpdate() {
    clearTimeout(this.chartUpdateTimeout)
    this.chartUpdateTimeout = setTimeout(() => this.updateChart(), CHART_UPDATE_DELAY_MS)
  }

  updateConfig(e) {
    const config = e.target.value
    window.localStorage.setItem('config', config)
    this.setState({ config: config }, this.scheduleChartUpdate.bind(this))
  }

  updateLens(e) {
    const text = e.target.value
    window.localStorage.setItem('lens', text)
    this.setState({ lens: text }, this.scheduleChartUpdate.bind(this))
  }

  updateChart() {
    let chartData = []
    try {
      const lensCode = eval(this.state.lens)
      const collectOutput = L.collect(lensCode, this.state.data)
      this.setState({ collectOutput })
      const grouped = R.groupBy(R.prop('label'), collectOutput)
      chartData = {
        labels: Object.values(grouped)[0].map(R.prop('time')),
        datasets: Object.entries(grouped).map(([label, values]) => ({
          type: 'bar',
          label,
          data: values.map(R.prop('value')),
        })),
      }
      this.setState({ dataError: false })
    } catch (e) {
      this.setState({ dataError: true, collectOutput: [{ time: '2023-12-25', label: 'foo', value: 'bar' }] })
      console.error(e)
    }
    this.setState({ chartData })
  }

  formatConfig() {
    this.setState({ config: beautify(JSON.stringify(this.state.config)) })
  }

  toggleConfig() {
    this.setState({ configVisible: !this.state.configVisible })
  }

  toggleLens() {
    this.setState({ lensVisible: !this.state.lensVisible })
  }
  toggleData() {
    this.setState({ dataVisible: !this.state.dataVisible })
  }

  toggleCollectData() {
    this.setState({ collectDataVisible: !this.state.collectDataVisible })
  }

  toggleChartData() {
    this.setState({ chartDataVisible: !this.state.chartDataVisible })
  }

  formatLens() {
    this.setState({ lens: beautify(this.state.lens) })
  }

  selectConfig(e) {
    const config = this.state.configs.find(R.propEq(Number(e.target.value), 'id'))
    window.localStorage.setItem('lens', config.lens)
    window.localStorage.setItem('config', config.config)
    this.setState({ config: config.config, lens: config.lens, name: config.name }, this.updateChart.bind(this))
  }

  async saveConfig(e) {
    e.preventDefault()
    await requestJSONwithCredentials({
      url: `${apiURL}/admin/radiator/config`,
      method: 'POST',
      body: {
        name: this.state.name,
        lens: this.state.lens,
        config: this.state.config,
      },
    })

    await this.updateRadiatorData()
  }

  renderDataSummary() {
    const summaries = summariseRadiatorData(this.state.data)
    return (
      <div className="admin-radiator-data">
        {summaries.length === 0 ? (
          <div className="muted">No radiator runs in the past week.</div>
        ) : (
          <table className="admin-jobs-table admin-radiator-data-table">
            <thead>
              <tr>
                <th>Query</th>
                <th>Runs</th>
                <th>Latest run</th>
                <th>Status</th>
                <th>Rows</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(({ job, runs, latestStarted, latestSuccess, latestRows, latestError }) => (
                <tr key={job}>
                  <td>{job}</td>
                  <td className="muted">{runs}</td>
                  <td className="muted">{formatDateTime(latestStarted)}</td>
                  <td>
                    <span
                      className={latestSuccess ? 'admin-jobs-status-success' : 'admin-jobs-status-failed'}
                      title={latestError || undefined}
                    >
                      {latestSuccess ? 'Success' : 'Failed'}
                    </span>
                  </td>
                  <td className="muted">{latestRows === null ? '—' : latestRows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button
          type="button"
          className="button button-push_button button-push_button-small"
          disabled={summaries.length === 0}
          onClick={() => downloadJSON(this.state.data, 'radiator-data.json')}
        >
          Download JSON
        </button>
      </div>
    )
  }

  render() {
    let config = {
      type: 'line',
    }
    return (
      <div className="page-container scroll-container admin-page">
        <AdminTabs />
        <div className="admin-page-header">
          <h1>Radiator</h1>
        </div>
        <div className="admin-grid">
          <div className="admin-column">
            <div className="admin-page-chart">
              <Chart type={config.type} options={this.state.config} data={this.state.chartData} />
            </div>
            <div className="admin-field">
              <h2
                className={`admin-section-toggle ${this.state.chartDataVisible ? 'open' : ''}`}
                onClick={this.toggleChartData.bind(this)}
              >
                Chart data
              </h2>
              {this.state.chartDataVisible && (
                <textarea
                  disabled
                  rows={10}
                  className={this.state.dataError ? 'error' : ''}
                  value={previewJSON(this.state.chartData)}
                />
              )}
            </div>
            <div className="admin-field">
              <h2
                className={`admin-section-toggle ${this.state.collectDataVisible ? 'open' : ''}`}
                onClick={this.toggleCollectData.bind(this)}
              >
                Collected data
              </h2>
              {this.state.collectDataVisible && (
                <textarea
                  disabled
                  rows={10}
                  className={this.state.dataError ? 'error' : ''}
                  value={previewJSON(this.state.collectOutput)}
                />
              )}
            </div>
          </div>
          <div className="admin-column">
            <div className="admin-field">
              <span
                className={`admin-section-toggle ${this.state.dataVisible ? 'open' : ''}`}
                onClick={this.toggleData.bind(this)}
              >
                Data
              </span>
              {this.state.dataVisible && this.renderDataSummary()}
            </div>
            <form onSubmit={this.saveConfig.bind(this)}>
              <div className="admin-field">
                <span
                  className={`admin-section-toggle ${this.state.configVisible ? 'open' : ''}`}
                  onClick={this.toggleConfig.bind(this)}
                >
                  Config
                </span>
                {this.state.configVisible && (
                  <textarea
                    rows={10}
                    onChange={this.updateConfig.bind(this)}
                    onBlur={this.formatConfig.bind(this)}
                    value={this.state.config}
                  />
                )}
              </div>
              <div className="admin-field">
                <span
                  className={`admin-section-toggle ${this.state.lensVisible ? 'open' : ''}`}
                  onClick={this.toggleLens.bind(this)}
                >
                  Lens
                </span>
                {this.state.lensVisible && (
                  <>
                    <textarea
                      rows={10}
                      value={this.state.lens}
                      onChange={this.updateLens.bind(this)}
                      onBlur={this.formatLens.bind(this)}
                    ></textarea>
                    <button
                      className="button button-push_button"
                      onClick={(e) => {
                        e.preventDefault()
                        this.formatLens()
                      }}
                    >
                      Format
                    </button>
                  </>
                )}
              </div>
              <div className="admin-field">
                <label htmlFor="admin-radiator-name">Name</label>
                <input id="admin-radiator-name" type="text" onChange={this.updateName.bind(this)} />
              </div>
              <button type="submit" className="button button-push_button button-push_button-primary">
                Save
              </button>
              <div className="admin-field">
                <label htmlFor="admin-radiator-load">Load radiator</label>
                <select id="admin-radiator-load" onChange={this.selectConfig.bind(this)}>
                  <option disabled></option>
                  {this.state.configs.map((config) => (
                    <option key={config.id} value={config.id}>
                      {config.name}
                    </option>
                  ))}
                </select>
              </div>
            </form>
          </div>
        </div>
        <AdminDatabaseReset />
      </div>
    )
  }
}

export default withRouter(Admin)
