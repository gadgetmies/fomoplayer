const interceptor = require('./interceptor.js')
const { JunodownloadUrlRegex } = require('../integrations/junodownload')
const { readFileSync } = require('fs')
const path = require('path')

const productHtml = readFileSync(
  path.resolve(`${__dirname}/fixtures/junodownload-product-7475994-02.html`),
).toString('utf-8')
const artistHtml = readFileSync(
  path.resolve(`${__dirname}/fixtures/junodownload-artist-basstripper.html`),
).toString('utf-8')
const labelHtml = readFileSync(
  path.resolve(`${__dirname}/fixtures/junodownload-label-dnb-allstars.html`),
).toString('utf-8')
const genreHtml = readFileSync(
  path.resolve(`${__dirname}/fixtures/junodownload-drumandbass.html`),
).toString('utf-8')

const respondWith =
  (body, contentType = 'application/json') =>
  () => ({
    body,
    options: {
      headers: {
        'content-type': contentType,
      },
    },
  })

const respondWithHTML = (html) => respondWith(html, 'text/html; charset=utf-8')

const getMocks = (urlResponsePairs) =>
  urlResponsePairs.map(([matcher, response]) => ({
    test: matcher instanceof Function ? matcher : ({ url: urlToMatch }) => matcher === urlToMatch,
    getResponse:
      typeof response === 'string'
        ? respondWithHTML(response)
        : respondWith(response, 'application/json'),
  }))

const base = 'https://www.junodownload.com'

module.exports.init = () => {
  const junodownloadRedirect = process.env.JUNODOWNLOAD_API_REDIRECT
  const useMocks = process.env.JUNODOWNLOAD_API_MOCK

  return interceptor.init({
    proxies: [
      {
        test: () => !useMocks,
        url: ({ url }) => {
          const u = new URL(url)
          u.host = junodownloadRedirect
          return u.toString()
        },
      },
    ],
    mocks: getMocks([
      [`${base}/products/basstripper-no-looking-back-unmasked/7475994-02`, productHtml],
      [`${base}/products/basstripper-no-looking-back-unmasked/7475994-02/`, productHtml],
      [`${base}/artists/Basstripper/`, artistHtml],
      [`${base}/artists/Basstripper`, artistHtml],
      [`${base}/labels/DnB+Allstars/`, labelHtml],
      [`${base}/labels/DnB%2BAllstars/`, labelHtml],
      [`${base}/labels/DnB+Allstars`, labelHtml],
      [`${base}/drumandbass/`, genreHtml],
      [`${base}/drumandbass`, genreHtml],
    ]),
    name: 'Junodownload',
    regex: JunodownloadUrlRegex,
  })
}
