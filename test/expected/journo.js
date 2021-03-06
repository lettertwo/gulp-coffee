(function() {
  var Journo, catchErrors, detectDescription, detectTitle, exec, fatal, folderContents, fs, highlight, htmlPath, loadConfig, loadLayout, loadManifest, manifestPath, mapLink, marked, opener, path, postName, postPath, postUrl, renderVariables, rsync, shared, sortedPosts, spawn, updateManifest, _, _ref,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  Journo = module.exports = {};

  marked = require('marked');

  _ = require('underscore');

  shared = {};

  Journo.render = function(post, source) {
    return catchErrors(function() {
      var content, markdown, title, variables;
      loadLayout();
      source || (source = fs.readFileSync(postPath(post)));
      variables = renderVariables(post);
      markdown = _.template(source.toString())(variables);
      title = detectTitle(markdown);
      content = marked.parser(marked.lexer(markdown));
      return shared.layout(_.extend(variables, {
        title: title,
        content: content
      }));
    });
  };

  loadLayout = function(force) {
    var layout;
    if (!force && (layout = shared.layout)) {
      return layout;
    }
    return shared.layout = _.template(fs.readFileSync('layout.html').toString());
  };

  opener = (function() {
    switch (process.platform) {
      case 'darwin':
        return 'open';
      case 'win32':
        return 'start';
      default:
        return 'xdg-open';
    }
  })();

  fs = require('fs');

  path = require('path');

  _ref = require('child_process'), spawn = _ref.spawn, exec = _ref.exec;

  Journo.build = function() {
    loadManifest();
    if (!fs.existsSync('site')) {
      fs.mkdirSync('site');
    }
    return exec("rsync -vur --delete public/ site", function(err, stdout, stderr) {
      var file, html, post, _i, _len, _ref1;
      if (err) {
        throw err;
      }
      _ref1 = folderContents('posts');
      for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
        post = _ref1[_i];
        html = Journo.render(post);
        file = htmlPath(post);
        if (!fs.existsSync(path.dirname(file))) {
          fs.mkdirSync(path.dirname(file));
        }
        fs.writeFileSync(file, html);
      }
      return fs.writeFileSync("site/feed.rss", Journo.feed());
    });
  };

  loadConfig = function() {
    var err;
    if (shared.config) {
      return;
    }
    try {
      shared.config = JSON.parse(fs.readFileSync('config.json'));
    } catch (_error) {
      err = _error;
      fatal("Unable to read config.json");
    }
    return shared.siteUrl = shared.config.url.replace(/\/$/, '');
  };

  Journo.publish = function() {
    Journo.build();
    return rsync('site/images/', path.join(shared.config.publish, 'images/'), function() {
      return rsync('site/', shared.config.publish);
    });
  };

  rsync = function(from, to, callback) {
    var child, port;
    port = "ssh -p " + (shared.config.publishPort || 22);
    child = spawn("rsync", ['-vurz', '--delete', '-e', port, from, to]);
    child.stdout.on('data', function(out) {
      return console.log(out.toString());
    });
    child.stderr.on('data', function(err) {
      return console.error(err.toString());
    });
    if (callback) {
      return child.on('exit', callback);
    }
  };

  manifestPath = 'journo-manifest.json';

  loadManifest = function() {
    loadConfig();
    shared.manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath)) : {};
    updateManifest();
    return fs.writeFileSync(manifestPath, JSON.stringify(shared.manifest));
  };

  updateManifest = function() {
    var content, entry, manifest, post, posts, stat, _i, _len;
    manifest = shared.manifest;
    posts = folderContents('posts');
    for (post in manifest) {
      if (__indexOf.call(posts, post) < 0) {
        delete manifest[post];
      }
    }
    for (_i = 0, _len = posts.length; _i < _len; _i++) {
      post = posts[_i];
      stat = fs.statSync(postPath(post));
      entry = manifest[post];
      if (!entry || entry.mtime !== stat.mtime) {
        entry || (entry = {
          pubtime: stat.ctime
        });
        entry.mtime = stat.mtime;
        content = fs.readFileSync(postPath(post)).toString();
        entry.title = detectTitle(content);
        entry.description = detectDescription(content, post);
        manifest[post] = entry;
      }
    }
    return true;
  };

  highlight = require('highlight.js');

  marked.setOptions({
    highlight: function(code, lang) {
      if (highlight.LANGUAGES[lang] != null) {
        return highlight.highlight(lang, code, true).value;
      } else {
        return highlight.highlightAuto(code).value;
      }
    }
  });

  Journo.feed = function() {
    var RSS, config, entry, feed, post, _i, _len, _ref1;
    RSS = require('rss');
    loadConfig();
    config = shared.config;
    feed = new RSS({
      title: config.title,
      description: config.description,
      feed_url: "" + shared.siteUrl + "/rss.xml",
      site_url: shared.siteUrl,
      author: config.author
    });
    _ref1 = sortedPosts().reverse().slice(0, 20);
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      post = _ref1[_i];
      entry = shared.manifest[post];
      feed.item({
        title: entry.title,
        description: entry.description,
        url: postUrl(post),
        date: entry.pubtime
      });
    }
    return feed.xml();
  };

  Journo.init = function() {
    var bootstrap, here;
    here = fs.realpathSync('.');
    if (fs.existsSync('posts')) {
      fatal("A blog already exists in " + here);
    }
    bootstrap = path.join(__dirname, 'bootstrap/*');
    return exec("rsync -vur --delete " + bootstrap + " .", function(err, stdout, stderr) {
      if (err) {
        throw err;
      }
      return console.log("Initialized new blog in " + here);
    });
  };

  Journo.preview = function() {
    var http, mime, server, url, util;
    http = require('http');
    mime = require('mime');
    url = require('url');
    util = require('util');
    loadManifest();
    server = http.createServer(function(req, res) {
      var publicPath, rawPath;
      rawPath = url.parse(req.url).pathname.replace(/(^\/|\/$)/g, '') || 'index';
      if (rawPath === 'feed.rss') {
        res.writeHead(200, {
          'Content-Type': mime.lookup('.rss')
        });
        return res.end(Journo.feed());
      } else {
        publicPath = "public/" + rawPath;
        return fs.exists(publicPath, function(exists) {
          var post;
          if (exists) {
            res.writeHead(200, {
              'Content-Type': mime.lookup(publicPath)
            });
            return fs.createReadStream(publicPath).pipe(res);
          } else {
            post = "posts/" + rawPath + ".md";
            return fs.exists(post, function(exists) {
              if (exists) {
                loadLayout(true);
                return fs.readFile(post, function(err, content) {
                  res.writeHead(200, {
                    'Content-Type': 'text/html'
                  });
                  return res.end(Journo.render(post, content));
                });
              } else {
                res.writeHead(404);
                return res.end('404 Not Found');
              }
            });
          }
        });
      }
    });
    server.listen(1234);
    console.log("Journo is previewing at http://localhost:1234");
    return exec("" + opener + " http://localhost:1234");
  };

  Journo.run = function() {
    var command;
    command = process.argv[2] || 'preview';
    if (Journo[command]) {
      return Journo[command]();
    }
    return console.error("Journo doesn't know how to '" + command + "'");
  };

  Journo.help = Journo['--help'] = function() {
    return console.log("Usage: journo [command]\n\nIf called without a command, `journo` will preview your blog.\n\ninit      start a new blog in the current folder\nbuild     build a static version of the blog into 'site'\npreview   live preview the blog via a local server\npublish   publish the blog to your remote server");
  };

  Journo.version = Journo['--version'] = function() {
    return console.log("Journo 0.0.1");
  };

  postPath = function(post) {
    return "posts/" + post;
  };

  htmlPath = function(post) {
    var name;
    name = postName(post);
    if (name === 'index') {
      return 'site/index.html';
    } else {
      return "site/" + name + "/index.html";
    }
  };

  postName = function(post) {
    return path.basename(post, '.md');
  };

  postUrl = function(post) {
    return "" + shared.siteUrl + "/" + (postName(post)) + "/";
  };

  detectTitle = function(content) {
    var _ref1;
    return (_ref1 = _.find(marked.lexer(content), function(token) {
      return token.type === 'heading';
    })) != null ? _ref1.text : void 0;
  };

  detectDescription = function(content, post) {
    var desc, _ref1;
    desc = (_ref1 = _.find(marked.lexer(content), function(token) {
      return token.type === 'paragraph';
    })) != null ? _ref1.text : void 0;
    return marked.parser(marked.lexer(_.template("" + desc + "...")(renderVariables(post))));
  };

  folderContents = function(folder) {
    return fs.readdirSync(folder).filter(function(f) {
      return f.charAt(0) !== '.';
    });
  };

  sortedPosts = function() {
    return _.sortBy(_.without(_.keys(shared.manifest), 'index.md'), function(post) {
      return shared.manifest[post].pubtime;
    });
  };

  renderVariables = function(post) {
    return {
      _: _,
      fs: fs,
      path: path,
      mapLink: mapLink,
      postName: postName,
      folderContents: folderContents,
      posts: sortedPosts(),
      post: path.basename(post),
      manifest: shared.manifest
    };
  };

  mapLink = function(place, additional, zoom) {
    var query;
    if (additional == null) {
      additional = '';
    }
    if (zoom == null) {
      zoom = 15;
    }
    query = encodeURIComponent("" + place + ", " + additional);
    return "<a href=\"https://maps.google.com/maps?q=" + query + "&t=h&z=" + zoom + "\">" + place + "</a>";
  };

  catchErrors = function(func) {
    var err;
    try {
      return func();
    } catch (_error) {
      err = _error;
      console.error(err.stack);
      return "<pre>" + err.stack + "</pre>";
    }
  };

  fatal = function(message) {
    console.error(message);
    return process.exit(1);
  };

}).call(this);
