import React, { Component } from 'react'
import 'chart.js/auto'
import { Chart } from 'react-chartjs-2'
import { requestJSONwithCredentials, requestWithCredentials } from './request-json-with-credentials'
import { apiURL } from './config'
import { js as beautify } from 'js-beautify/js'

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
                  position: 'top'
                },
                title: {
                  display: true,
                  text: 'Chart.js Line Chart'
                }
              }
            }
          },
          null,
          2
        )
    }
  }

  async updateRadiatorData() {
    this.setState({ loading: true })
    const data = await requestJSONwithCredentials({ url: `${apiURL}/admin/radiator` })
    const configs = await requestJSONwithCredentials({ url: `${apiURL}/admin/radiator/config` })
    this.setState({
      data: JSON.stringify(data, null, 2),
      configs,
      loading: false
    })
  }

  async componentDidMount() {
    await this.updateRadiatorData()
    this.updateChart()
  }

  updateConfig(e) {
    const config = e.target.value
    window.localStorage.setItem('config', config)
    this.setState({ config: config })
    this.updateChart()
  }

  updateLens(e) {
    const text = e.target.value
    this.setState({ lens: text })
    window.localStorage.setItem('lens', text)
    this.updateChart()
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
          data: values.map(R.prop('value'))
        }))
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

  formatLens() {
    this.setState({ lens: beautify(JSON.stringify(this.state.lens)) })
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
    const config = this.state.configs.find(R.propEq('id', Number(e.target.value)))
    this.setState({ config: config.config, lens: config.lens, name: config.name })
    this.updateChart()
  }

  async saveConfig(e) {
    e.preventDefault()
    await requestJSONwithCredentials({
      url: `${apiURL}/admin/radiator/config`,
      method: 'POST',
      body: {
        name: this.state.name,
        lens: this.state.lens,
        config: this.state.config
      }
    })

    await this.updateRadiatorData()
  }

  render() {
    let config = {
      type: 'line'
    }
    return (
      <div>
        <h1>Radiator</h1>
        <div style={{ display: 'flex', gap: 15 }}>
          <div style={{ width: '50%' }}>
            <Chart type={config.type} options={config} data={this.state.chartData} />
            <h2 onClick={this.toggleChartData.bind(this)}>Chart data</h2>
            {this.state.chartDataVisible && (
              <textarea
                disabled
                onChange={this.updateData.bind(this)}
                rows={10}
                style={{ width: '100%', border: this.state.dataError ? '1px solid red' : '1px solid black' }}
                value={JSON.stringify(this.state.chartData, null, 2)}
              />
            )}
            <h2 onClick={this.toggleCollectData.bind(this)}>Collected data</h2>
            {this.state.collectDataVisible && (
              <textarea
                disabled
                onChange={this.updateData.bind(this)}
                rows={10}
                style={{ width: '100%', border: this.state.dataError ? '1px solid red' : '1px solid black' }}
                value={JSON.stringify(this.state.collectOutput, null, 2)}
              />
            )}
          </div>
          <div style={{ width: '50%' }}>
            <label>
              <span onClick={this.toggleData.bind(this)}>Data</span>
              {this.state.dataVisible && (
                <textarea
                  onChange={this.updateData.bind(this)}
                  rows={10}
                  style={{ width: '100%' }}
                  value={this.state.data}
                />
              )}
            </label>
            <form onSubmit={this.saveConfig.bind(this)} style={{ display: 'flex', flexDirection: 'column' }}>
              <label>
                <span onClick={this.toggleConfig.bind(this)}>Config</span>
                {this.state.configVisible && (
                  <textarea
                    rows={10}
                    style={{ width: '100%' }}
                    onChange={this.updateConfig.bind(this)}
                    onBlur={this.formatConfig.bind(this)}
                    value={this.state.config}
                  />
                )}
              </label>
              <label>
                <span onClick={this.toggleLens.bind(this)}>Lens</span>
                {this.state.lensVisible && (
                  <>
                    <textarea
                      style={{ width: '100%' }}
                      rows={10}
                      value={this.state.lens}
                      onChange={this.updateLens.bind(this)}
                      onBlur={this.formatLens.bind(this)}
                    ></textarea>
                    <button
                      onClick={e => {
                        e.preventDefault()
                        this.formatLens.bind(this)
                      }}
                    >
                      Format
                    </button>
                  </>
                )}
              </label>
              <label>
                Name
                <input type="text" onChange={this.updateName.bind(this)} />
              </label>
              <button onClick={this.saveConfig.bind(this)}>Save</button>
              <h2>Load radiator</h2>
              <select onChange={this.selectConfig.bind(this)}>
                <option disabled></option>
                {this.state.configs.map(config => (
                  <option value={config.id}>{config.name}</option>
                ))}
              </select>
            </form>
          </div>
        </div>
      </div>
    )
  }
}

export default Admin
