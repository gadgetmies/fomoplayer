export default `
var wait = (test, success) => {
  var result = test()
  if (!result) {
    setTimeout(() => wait(test, success), 100)
  } else {
    success(result)
  }
}
`
