const express = require('express')

const app = express()

app.get('/', (req, res) => {
  res.send('Foo')
})

app.listen(80)
