'use strict';

var iopcore = require('iopcore-lib');
var async = require('async');
var TxController = require('./transactions');
var Common = require('./common');

function AddressController(node) {
  this.node = node;
  this.txController = new TxController(node);
  this.common = new Common({log: this.node.log});
}

AddressController.prototype.show = function(req, res) {
  var self = this;
  var options = {
    noTxList: parseInt(req.query.noTxList)
  };

  if (req.query.from && req.query.to) {
    options.from = parseInt(req.query.from);
    options.to = parseInt(req.query.to);
  }

  this.getAddressSummary(req.addr, options, function(err, data) {
    if(err) {
      return self.common.handleErrors(err, res);
    }

    res.jsonp(data);
  });
};

AddressController.prototype.balance = function(req, res) {
  this.addressSummarySubQuery(req, res, 'balanceSat');
};

AddressController.prototype.totalReceived = function(req, res) {
  this.addressSummarySubQuery(req, res, 'totalReceivedSat');
};

AddressController.prototype.totalSent = function(req, res) {
  this.addressSummarySubQuery(req, res, 'totalSentSat');
};

AddressController.prototype.unconfirmedBalance = function(req, res) {
  this.addressSummarySubQuery(req, res, 'unconfirmedBalanceSat');
};

AddressController.prototype.addressSummarySubQuery = function(req, res, param) {
  var self = this;
  this.getAddressSummary(req.addr, {}, function(err, data) {
    if(err) {
      return self.common.handleErrors(err, res);
    }

    res.jsonp(data[param]);
  });
};

AddressController.prototype.getAddressSummary = function(address, options, callback) {

  this.node.getAddressSummary(address, options, function(err, summary) {
    if(err) {
      return callback(err);
    }

    var transformed = {
      addrStr: address,
      balance: summary.balance / 1e8,
      balanceSat: summary.balance,
      totalReceived: summary.totalReceived / 1e8,
      totalReceivedSat: summary.totalReceived,
      totalSent: summary.totalSpent / 1e8,
      totalSentSat: summary.totalSpent,
      unconfirmedBalance: summary.unconfirmedBalance / 1e8,
      unconfirmedBalanceSat: summary.unconfirmedBalance,
      unconfirmedTxApperances: summary.unconfirmedAppearances, // misspelling - ew
      txApperances: summary.appearances, // yuck
      transactions: summary.txids
    };

    callback(null, transformed);
  });
};

AddressController.prototype.checkAddr = function(req, res, next) {
  var self = this;
  var address = req.params.addr;
  
  self.node.services.iopd.importAddress(address, function(err, suc){
	  
	 if (err){
		  return self.common.handleErrors({
             message: err,
             code: 1
          }, res);
	 }
	  
	 self.node.services.iopd.getListTransactionsByAddress(address, function(err, trans){
	            
		 var list_txid = [];
		 var list_txs_uncof = [];
		 var list_txs_conf = [];
		 
		 var balance = 0;
		 var totalReceived = 0;
		 var totalSent = 0;
		 var unconfirmedBalance = 0;
	 
		 function detail(tx, cb){
				 
			 balance += tx.amount;
			 
			 if (tx.amount < 0) 
				 totalSent += (tx.amount * (-1));
			 else
				 totalReceived += tx.amount;
			 
			 if (tx.confirmations < 6)
				 unconfirmedBalance += tx.amount;
			 
			 list_txid.push(tx.txid);
			 
			 self.node.services.iopd.getTransactionByHash(tx.txid, function(er, res){
				
				if (er)
					cb(er, null);
				 
				if (tx.confirmations < 0) 
					list_txs_uncof.push(res);
				else
					list_txs_conf.push(res);
				
				cb(null, true);
			 });
			 
		 }
	 
		 async.map(trans, detail, function(err_as, arr_as) {
			 
			   if (err_as){
					return self.common.handleErrors({
						 message: err_as,
						 code: 1
					  }, res);
				}

			   var transformed = {
				  addrStr: address,
				  balance: balance,
				  balanceSat: balance * 1e8,
				  totalReceived: totalReceived,
				  totalReceivedSat: totalReceived * 1e8,
				  totalSent: totalSent,
				  totalSentSat:  totalSent * 1e8,
				  unconfirmedBalance: unconfirmedBalance ,
				  unconfirmedBalanceSat: unconfirmedBalance * 1e8,
				  unconfirmedTxApperances: list_txs_uncof, // misspelling - ew
				  txApperances: list_txs_conf, // yuck
				  transactions: list_txid
				};
				
				console.log("length: " + transformed.length);
                res.jsonp(transformed);
			 
		  });
	  
	  });
	   
  });
  
  
  
};

AddressController.prototype.checkAddrs = function(req, res, next) {
  if(req.body.addrs) {
    req.addrs = req.body.addrs.split(',');
  } else {
    req.addrs = req.params.addrs.split(',');
  }

  this.check(req, res, next, req.addrs);
};

AddressController.prototype.check = function(req, res, next, addresses) {
  var self = this;
  if(!addresses.length || !addresses[0]) {
    return self.common.handleErrors({
      message: 'Must include address',
      code: 1
    }, res);
  }

  for(var i = 0; i < addresses.length; i++) {
    try {
      var a = new iopcore.Address(addresses[i]);
    } catch(e) {
      return self.common.handleErrors({
        message: 'Invalid address: ' + e.message,
        code: 1
      }, res);
    }
  }

  next();
};

AddressController.prototype.utxo = function(req, res) {
  var self = this;

  this.node.getAddressUnspentOutputs(req.addr, {}, function(err, utxos) {
    if(err) {
      return self.common.handleErrors(err, res);
    } else if (!utxos.length) {
      return res.jsonp([]);
    }
    res.jsonp(utxos.map(self.transformUtxo.bind(self)));
  });
};

AddressController.prototype.multiutxo = function(req, res) {
  var self = this;
  this.node.getAddressUnspentOutputs(req.addrs, true, function(err, utxos) {
    if(err && err.code === -5) {
      return res.jsonp([]);
    } else if(err) {
      return self.common.handleErrors(err, res);
    }

    res.jsonp(utxos.map(self.transformUtxo.bind(self)));
  });
};

AddressController.prototype.transformUtxo = function(utxoArg) {
  var utxo = {
    address: utxoArg.address,
    txid: utxoArg.txid,
    vout: utxoArg.outputIndex,
    scriptPubKey: utxoArg.script,
    amount: utxoArg.satoshis / 1e8,
    satoshis: utxoArg.satoshis
  };
  if (utxoArg.height && utxoArg.height > 0) {
    utxo.height = utxoArg.height;
    utxo.confirmations = this.node.services.iopd.height - utxoArg.height + 1;
  } else {
    utxo.confirmations = 0;
  }
  if (utxoArg.timestamp) {
    utxo.ts = utxoArg.timestamp;
  }
  return utxo;
};

AddressController.prototype._getTransformOptions = function(req) {
  return {
    noAsm: parseInt(req.query.noAsm) ? true : false,
    noScriptSig: parseInt(req.query.noScriptSig) ? true : false,
    noSpent: parseInt(req.query.noSpent) ? true : false
  };
};

AddressController.prototype.multitxs = function(req, res, next) {
  var self = this;

  var options = {
    from: parseInt(req.query.from) || parseInt(req.body.from) || 0
  };

  options.to = parseInt(req.query.to) || parseInt(req.body.to) || parseInt(options.from) + 10;

  self.node.getAddressHistory(req.addrs, options, function(err, result) {
    if(err) {
      return self.common.handleErrors(err, res);
    }

    var transformOptions = self._getTransformOptions(req);

    self.transformAddressHistoryForMultiTxs(result.items, transformOptions, function(err, items) {
      if (err) {
        return self.common.handleErrors(err, res);
      }
      res.jsonp({
        totalItems: result.totalCount,
        from: options.from,
        to: Math.min(options.to, result.totalCount),
        items: items
      });
    });

  });
};

AddressController.prototype.transformAddressHistoryForMultiTxs = function(txinfos, options, callback) {
  var self = this;

  var items = txinfos.map(function(txinfo) {
    return txinfo.tx;
  }).filter(function(value, index, self) {
    return self.indexOf(value) === index;
  });

  async.map(
    items,
    function(item, next) {
      self.txController.transformTransaction(item, options, next);
    },
    callback
  );
};



module.exports = AddressController;
