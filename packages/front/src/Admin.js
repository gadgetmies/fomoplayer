import React, { Component } from 'react'
import 'chart.js/auto'
import { Chart } from 'react-chartjs-2'
import { requestJSONwithCredentials } from './request-json-with-credentials'
import { ErrorBoundary } from 'react-error-boundary'
import { apiURL } from './config'

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
      data: [
        {
          label: '# of Votes',
          data: [12, 19, 3, 5, 2, 3],
          borderWidth: 1
        }
      ],
      chartData: { datasets: [], labels: [] },
      visualisations: window.localStorage.getItem('visualisations') || '[]',
      lens: window.localStorage.getItem('lens') || '[]',
      lensCode: [],
      collectOutput: [],
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
    this.setState({
      data: JSON.stringify(data, null, 2),
      loading: false
    })
  }
  async componentDidMount() {
    await this.updateRadiatorData()
  }

  storeCurrentVisualisation() {
    const config = JSON.parse(this.state.config)
    const lens = JSON.parse(this.state.lens)
    let newVisualisations = [...this.state.visualisations, { config, lens, name: this.state.name }]
    window.localStorage.setItem('visualisations', JSON.stringify(newVisualisations))
    this.setState({ visualisations: JSON.stringify(newVisualisations) })
  }

  updateConfig(e) {
    window.localStorage.setItem('config', e.target.value)
    this.setState({ config: e.target.value })
  }

  updateLens(e) {
    const text = e.target.value
    window.localStorage.setItem('lens', text)
    let lensCode
    let chartData = []
    try {
      lensCode = eval(text)
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
      this.setState({ dataError: true })
      console.error(e)
    }
    this.setState({ lens: text, lensCode, chartData })
  }

  formatConfig() {
    this.setState({ config: this.state.config })
  }

  formatLens() {
    //this.setState({ lens: JSON.stringify(this.state.lens, null, 2) })
  }

  render() {
    let config = {
      type: 'line'
    }
    return (
      <div>
        <h1>Radiator</h1>
        <div style={{ display: 'flex' }}>
          <div style={{ width: '50%' }}>
            <Chart type={config.type} options={config} data={this.state.chartData} />
            <textarea
              disabled
              onChange={this.updateData.bind(this)}
              rows={10}
              style={{ width: '100%', border: this.state.dataError ? '1px solid red' : '1px solid black' }}
              value={JSON.stringify(this.state.chartData, null, 2)}
            ></textarea>
            <textarea
              disabled
              onChange={this.updateData.bind(this)}
              rows={10}
              style={{ width: '100%', border: this.state.dataError ? '1px solid red' : '1px solid black' }}
              value={JSON.stringify(this.state.collectOutput, null, 2)}
            ></textarea>
          </div>
          <div style={{ width: '50%' }}>
            <textarea
              onChange={this.updateData.bind(this)}
              rows={10}
              style={{ width: '100%' }}
              value={this.state.data}
            ></textarea>
            <form
              onSubmit={this.storeCurrentVisualisation.bind(this)}
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <label>
                Config
                <textarea
                  rows={10}
                  style={{ width: '100%' }}
                  onChange={this.updateConfig.bind(this)}
                  onBlur={this.formatConfig.bind(this)}
                  value={this.state.config}
                ></textarea>
              </label>
              <label>
                Lens
                <textarea
                  style={{ width: '100%' }}
                  rows={10}
                  value={this.state.lens}
                  onChange={this.updateLens.bind(this)}
                  onBlur={this.formatLens.bind(this)}
                ></textarea>
              </label>
              <label>
                Name
                <input type="text" onChange={this.updateName.bind(this)} />
              </label>
              <button>Save</button>
            </form>
          </div>
        </div>
      </div>
    )
  }
}

export default Admin
