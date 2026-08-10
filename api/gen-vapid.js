const webpush = require('web-push');

module.exports = async (req, res) => {
  try {
    const vapidKeys = webpush.generateVAPIDKeys();
    return res.status(200).json(vapidKeys);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
