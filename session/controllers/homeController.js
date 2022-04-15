const collectionController = require('collectionController')

exports.renderPage = (req, res, next) => {
  let rankingOfKings = collectionController.getTopTen();
};
