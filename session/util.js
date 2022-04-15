exports.writeError = (res, msg) => {
    res.write(JSON.stringify({error: true, message: msg}))
}