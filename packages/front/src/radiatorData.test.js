import { previewJSON, summariseRadiatorData } from './radiatorData'

describe('summariseRadiatorData', () => {
  it('summarises the latest run of each job', () => {
    const data = [
      {
        job_name: 'added-tracks-by-store.sql',
        results: [
          { started: '2026-11-17T06:00:00Z', success: true, result: [{ store_name: 'Beatport', count: 3 }] },
          { started: '2026-11-16T06:00:00Z', success: true, result: [] },
        ],
      },
      {
        job_name: 'missing-previews.sql',
        results: [{ started: '2026-11-17T06:00:00Z', success: false, result: { error: 'too many rows' } }],
      },
    ]
    expect(summariseRadiatorData(data)).toEqual([
      {
        job: 'added-tracks-by-store.sql',
        runs: 2,
        latestStarted: '2026-11-17T06:00:00Z',
        latestSuccess: true,
        latestRows: 1,
        latestError: null,
      },
      {
        job: 'missing-previews.sql',
        runs: 1,
        latestStarted: '2026-11-17T06:00:00Z',
        latestSuccess: false,
        latestRows: null,
        latestError: 'too many rows',
      },
    ])
  })

  it('returns nothing for missing data', () => {
    expect(summariseRadiatorData(undefined)).toEqual([])
  })
})

describe('previewJSON', () => {
  it('formats a short value in full', () => {
    expect(previewJSON([1, 2], 2)).toBe(JSON.stringify([1, 2], null, 2))
  })

  it('limits a long array and says how much is shown', () => {
    const text = previewJSON([1, 2, 3], 2)
    expect(text).toContain(JSON.stringify([1, 2], null, 2))
    expect(text).toContain('showing 2 of 3 items')
  })
})
