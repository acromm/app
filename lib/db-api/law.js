/**
 * Module dependencies.
 */

var mongoose = require('mongoose');
var Law = mongoose.model('Law');
var commentApi = require('./comment');
var delegationApi = require('./delegation');
var tagApi = require('./tag');
var log = require('debug')('db-api:law');

/**
 * Get all laws
 *
 * @param {Function} fn callback function
 *   - 'err' error found on query or `null`
 *   - 'laws' list items found or `undefined`
 * @return {Module} `law` module
 * @api public
 */

exports.all = function all(fn) {
  log('Looking for all laws.')

  Law
  .find()
  .populate('tag')
  .exec(function (err, laws) {
    if (err) {
      log('Found error %j', err);
      return fn(err);
    };

    log('Delivering laws %j', pluck(laws, 'id'));
    fn(null, laws);
  });

  return this;
};

/**
 * Creates law
 *
 * @param {Object} data to create law
 * @param {Function} fn callback function
 *   - 'err' error found on query or `null`
 *   - 'law' item created or `undefined`
 * @return {Module} `law` module
 * @api public
 */

exports.create = function create(data, fn) {
  log('Creating new law %j', data);

  // wrong using tag api within proposal's
  log('Looking for tag %s in database.', data.tag);
  tagApi.create(data.tag, function (err, tag) {
    if (err) {
      log('Found error from tag creation %j', err);
      return fn(err);
    };

    data.tag = tag;

    var law = new Law(data);

    law.save(function (err, saved) {
      if (err) {
        if (11000 == err.code) {
          log('Attempt duplication.');
          exports.searchOne(law.lawId, fn);
        } else {
          log('Found error %s', err);
          fn(err);
        }

        return;
      };

      log('Delivering law %s', saved);
      fn(null, saved);
    });
  });

  return this;
};

/**
 * Search single law from lawId
 *
 * @param {String} lawId string to search by `lawId`
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'law' single law object found or `undefined`
 * @return {Module} `law` module
 * @api public
 */

exports.searchOne = function searchByLawId(lawId, fn) {
  var query = { lawId: lawId };

  log('Searching for single law matching %j', query);
  Law
  .findOne(query)
  .populate('tag')
  .exec(function (err, law) {
    if (err) {
      log('Found error %s', err);
      return fn(err);
    }

    log('Delivering law %s', law.id);
    fn(null, law);
  })

  return this;
};

/**
 * Get Law form `id` string or `ObjectId`
 *
 * @param {String|ObjectId} id Law's `id`
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'law' found item or `undefined`
 * @api public
 */

exports.get = function get(id, fn) {
  log('Looking for law %s', id);

  Law
  .findById(id)
  .populate('tag')
  .exec(function (err, law) {
    if (err) {
      log('Found error %s', err);
      return fn(err);
    };

    log('Delivering law %s', law.id);
    fn(null, law);
  });
};

/**
 * Vote law
 *
 * @param {String} id Law `id`
 * @param {String} citizen author of the vote
 * @param {String} value `positive` or `negative` or `neutral`
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'proposal' single object created or `undefined`
 * @api public
 */

exports.vote = function vote(id, citizen, value, fn) {
  log('Proceding to vote %s at law %s by citizen %s', value, id, citizen.id || citizen);

  Law.findById(id, function (err, law) {
    if (err) {
      log('Found error %s', err);
      return fn(err);
    };

    law.vote(citizen.id, value, function(err) {
      if (err) {
        log('Found error %s', err);
        return fn(err);
      };

      log('Voted %s at law %s by citizen %s', value, id, citizen.id || citizen);
      fn(null, law);
    });
  });
};

/*
 * Recount law votes and process delegations
 *
 * @param {String} id Law `id`
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'proposal' single object created or `undefined`
 * @api public
 */

exports.recount = function vote(id, fn) {
  log('Proceding to recount %s', id);

  Law.findById(id, function (err, law) {
    if (err) {
      log('Found error %s', err);
      return fn(err);
    };

    if ('recount' === law.status) {
      log('Called recount but recount has already started.');
      return fn(new Error('Recount already started.'));
    };

    if ('closed' === law.status) {
      log('Called recount but law vote cast is closed.');
      return fn(new Error('Vote cast closed for law.'));
    };

    // Mark law for recount
    law.recount(function(err) {
      if (err) {
        log('Found error %s', err);
        return fn(err);
      };

      // WRONG
      delegationApi.trees(pluck(law.votes, 'author'), function(trees) {
        var nodes = trees.map(function(t) { return t.nodes() })

        nodes.forEach(function(n) {
          // node value
          var author = n.truster;
          // node parent
          var trustee = n.trustee;
          // node's branch top node
          var caster = n.caster;

          law.proxyVote(author, trustee, caster);
        });

        law.save(function(err) {
          if (err) {
            log('Found err %s', err);
            return fn(err);
          };

          fn(null, law);
        });
      });
    });
  });
};

/**
 * Direct comment to law
 *
 * @param {String} id Proposal's `id`
 * @param {Object} comment to attach
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'law' single object created or `undefined`
 * @api public
 */

exports.comment = function comment(comment, fn) {
  log('Creating comment %j for law %s', comment.text, comment.reference);
  commentApi.create(comment, function (err, commentDoc) {
    if (err) {
      log('Found error %j', err);
      return fn(err);
    };

    log('Delivering comment %j', commentDoc);
    fn(null, commentDoc);
  });
};

/**
 * Get comments for law
 *
 * @param {String} id Law's `id`
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'law' single object created or `undefined`
 * @api public
 */

exports.comments = function comments(id, fn) {
  log('Get comments for law %s', id);
  commentApi.getFor({
    context: 'law',
    reference: id
  }, function (err, comments) {
    if (err) {
      log('Found error %j', err);
      return fn(err);
    };

    log('Delivering comments %j', pluck(comments, 'id'));
    fn(null, comments);
  });
};

/**
 * Map array of objects by `property`
 *
 * @param {Array} source array of objects to map
 * @param {String} property to map from objects
 * @return {Array} array of listed properties
 * @api private
 */

function pluck (source, property) {
  return source.map(function(item) { return item[property]; });
};