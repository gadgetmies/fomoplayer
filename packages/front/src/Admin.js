import React, { Component } from 'react'
import 'chart.js/auto'
import { Chart } from 'react-chartjs-2'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials'
import { apiURL } from './config'
import beautify from 'js-beautify'
import { withRouter } from 'react-router-dom'
import AdminDatabaseReset from './AdminDatabaseReset'
import './Admin.css'

const L = require('partial.lenses')
const R = require('ramda')

class Admin extends Component {
  updateData(e) {
    this.setState({ data: e.target.value })
  }

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
      data: JSON.stringify(data, null, 2),
      configs,
      loading: false,
    })
  }

  async componentDidMount() {
    await this.updateRadiatorData()
    this.updateChart()
  }

  updateConfig(e) {
    const config = e.target.value
    window.localStorage.setItem('config', config)
    this.setState({ config: config }, this.updateChart.bind(this))
  }

  updateLens(e) {
    const text = e.target.value
    window.localStorage.setItem('lens', text)
    this.setState({ lens: text }, this.updateChart.bind(this))
  }

  updateChart() {
    let chartData = []
    try {
      const lensCode = eval(this.state.lens)
      const collectOutput = L.collect(lensCode, JSON.parse(this.state.data))
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

  render() {
    let config = {
      type: 'line',
    }
    return (
      <div className="page-container scroll-container admin-page">
        <div className="admin-page-header">
          <h1>Radiator</h1>
          <div className="admin-page-header-actions">
            <button
              className="button button-push_button button-push_button-primary"
              onClick={() => this.props.history.push('/admin/jobs')}
            >
              Jobs
            </button>
            <button
              className="button button-push_button button-push_button-primary"
              onClick={() => this.props.history.push('/admin/duplicates')}
            >
              Manage Duplicates
            </button>
            <button
              className="button button-push_button button-push_button-primary"
              onClick={() => this.props.history.push('/admin/mislabeled')}
            >
              Fix Mislabeled
            </button>
            <button
              className="button button-push_button button-push_button-primary"
              onClick={() => this.props.history.push('/admin/artist-split')}
            >
              Split Artists
            </button>
          </div>
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
                  value={JSON.stringify(this.state.chartData, null, 2)}
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
                  value={JSON.stringify(this.state.collectOutput, null, 2)}
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
              {this.state.dataVisible && (
                <textarea onChange={this.updateData.bind(this)} rows={10} value={this.state.data} />
              )}
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
