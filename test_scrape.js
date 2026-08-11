const handler = require('./api/scrape-images.js');

const req = { 
  query: { url: 'https://clientyachtlink.com/l/1695de5165f86cb6' }, 
  method: 'GET' 
};

const res = { 
  setHeader: () => {}, 
  status: function(code) { 
    this.statusCode = code; 
    return this; 
  }, 
  json: (data) => console.log('Status:', res.statusCode, 'Data:', data.images ? data.images.length + ' images' : data), 
  end: () => console.log('Ended') 
};

handler(req, res).catch(console.error);
