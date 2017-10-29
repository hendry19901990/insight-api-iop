'use strict';

var request = require('request');

function CurrencyController(options) {
  this.node = options.node;
  var refresh = options.currencyRefresh || CurrencyController.DEFAULT_CURRENCY_DELAY;
  this.currencyDelay = refresh * 60000;
  this.exchange_rates = {
    iop_usd: 0.00,
    btc_usd: 0.00,
    btc_iop: 0.00
  };
  this.timestamp = Date.now();
}

CurrencyController.DEFAULT_CURRENCY_DELAY = 10;

CurrencyController.prototype.index = function(req, res) {
  var self = this;
  var currentTime = Date.now();
  if (self.exchange_rates.iop_usd === 0.00 || currentTime >= (self.timestamp + self.currencyDelay)) {
    self.timestamp = currentTime;
    
    getPrices(false, function(err, result){
		if(!err){
				   result.btc_usd = 0;
				   self.exchange_rates = result;
                   self.exchange_rates.bitstamp = result.iop_usd; // backwards compatibility
				   res.jsonp({
						status: 200,
						data: self.exchange_rates
				   });
		}else{
			self.node.log.error(err);
		}
    }); 
    
  } else {
    res.jsonp({
      status: 200,
      data: self.exchange_rates
    });
  }

};

function getPrices(is_btc, cb){
   var URL = "https://api.coinmarketcap.com/v1/ticker/" + ( (is_btc)? "bitcoin": "internet-of-people");   
   request(URL, function(err, response, body) {
        if (!err && response.statusCode === 200) {
           var resp = JSON.parse(body);
             if(Array.isArray(resp)){
                     if(is_btc)
                       return cb(null, resp[0].price_usd);
                     else
                       return cb(null, {iop_usd: resp[0].price_usd, btc_iop: resp[0].price_btc});
             }else{
                cb(resp, null);
             }
	    }else{
            cb(err, null);  
        }
   });
}

module.exports = CurrencyController;
