var fs = require('fs');
var os = require('os');

var md5 = require('md5');
var request = require('request');
var express = require('express');
var assign = require('object-assign');
var searchEngine = require('../google/google.js');
var Promise = require("es6-promise").Promise;
var cookieParser = require('cookie-parser');
var queryString = require('query-string');
var api_key_file = os.homedir() + '/.bungalow/spotify.key.json';
var cache_file = os.homedir() + '/.bungalow/spotify.cache.json';
var sessions_file = os.homedir() + '/.bungalow/spotify.sessions.json';
var google_api_key_file = os.homedir() + '/.bungalow/google.key.json';
var searchEngine = searchEngine.service;


process.on('unhandledRejection', error => {
  // Will print "unhandledRejection err is not defined"
  console.log('unhandledRejection', error.message);
});


var cache = require('../cache/cache.js');


var SpotifyService = function (session) {
    
    var self = this;
    
    this.cache = {};
    this.isPlaying = false;
    
    this.resources = {};
    this.callbacks = {};
    this.apikeys = JSON.parse(fs.readFileSync(api_key_file));
    this.accessToken = null;
    this.session = session;

    this.me = null;
    this.cache = {};
    if (fs.existsSync(cache_file)) {
       try {
            this.cache = JSON.parse(fs.readFileSync(cache_file));
        } catch (e) {
            
        }
    }
    
    this.session = null;
};


SpotifyService.prototype.getSessions = function () {
    if (fs.existsSync(sessions_file)) {
        return JSON.parse(fs.readFileSync(sessions_file));
    }
}


SpotifyService.prototype.setSessions = function (value) {
    fs.writeFileSync(sessions_file, JSON.strigify(value));
}


SpotifyService.prototype.getArtistByName = function (name) {
    var self = this;
    return new Promise(function (resolve, fail) {
       if (name.length == 22) {
            music.getArtist(name).then(function (result) {
                resolve(result);
            }, function (err) {
                fail(err);
            });
        } else {
            music.search('artist:"' + encodeURI(name) + '"', 0, 1, 'artist').then(function (result) {
                if (result.objects.length < 1)  {
                    fail(404);
                    return
                };
                music.getArtist(result.objects[0].id).then(function (result) {
                    resolve(result);
                }, function (err) {
                    fail(err);
                })
            }, function (err) {
                fail(err);
            })
        }
    });
}


SpotifyService.prototype.getAlbumByName = function (name, artist) {
    var self = this;
    return new Promise(function (resolve, fail) {
       self.search('album:"' + encodeURI(name) + '" AND artist:"' + encodeURI(artist.name) + "'", 'album', 0, 28).then(function (result) {
            if (result.objects.length < 1)  {
                fail({error: 'Not found'});
                return
            };
            music.getAlbum(result.objects[0].id).then(function (result) {
                resolve(result);
            }, function (err) {
                fail(err).send();
            })
        }, function (err) {
            fail(err).send();
        }) 
    });
}


SpotifyService.prototype.getAlbumByUPC = function (name, artist) {
    var self = this;
    return new Promise(function (resolve, fail) {
       self.search('upc:"' + encodeURI(name) + '"', 'album', 0, 28).then(function (result) {
            if (result.objects.length < 1)  {
                fail({error: 'Not found'});
                return
            };
            music.getAlbum(result.objects[0].id).then(function (result) {
                resolve(result);
            }, function (err) {
                fail(err).send();
            })
        }, function (err) {
            fail(err).send();
        }) 
    });
}



SpotifyService.prototype.getTrackByName = function (name, artist, album) {
    var self = this;
    return new Promise(function (resolve, fail) {
       self.search('"' + name + '" AND album:"' + encodeURI(name) + '" AND artist:"' + encodeURI(artist.name) + "'", 'track', 0, 28).then(function (result) {
            if (result.objects.length < 1)  {
                fail({error: 'Not found'});
                return
            };
             resolve(result);
       
        }, function (err) {
            fail(err).send();
        }) 
    });
}



SpotifyService.prototype.getLoginUrl = function () {
    return 'https://accounts.spotify.com/authorize?client_id=' + this.apikeys.client_id + '&scope=user-read-private playlist-modify-public playlist-modify-private user-read-currently-playing user-read-playback-state user-library-read user-library-modify user-modify-playback-state&response_type=code&redirect_uri=' + encodeURI(this.apikeys.redirect_uri);
}

SpotifyService.prototype.authenticate = function (req, resolve) {
    var self = this;
    this.req = req;
    console.log(req);
    console.log("Ta");
    request({
        url: 'https://accounts.spotify.com/api/token',
        method: 'POST',
        form: {
            grant_type: 'authorization_code',
            code: req.query.code,
            redirect_uri: self.apikeys.redirect_uri 
        },
        headers: {
            'Authorization': 'Basic ' + new Buffer(self.apikeys.client_id + ':' + self.apikeys.client_secret).toString('base64') 
        }
    }, function (error, response, body) {
        console.log(error);
        var result = JSON.parse(body);
        result.issued = new Date().getTime();
        if (error || !result.access_token) {
            resolve(error);
            
            return;
        }
        resolve(null, result);
    });

    
}


SpotifyService.prototype.getMe = function () {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/me').then(function (result) {
            result.artists = [
                
            ]
            
            resolve(result);
        }, function (error) {
            fail(error);
        });
    })
}

SpotifyService.prototype.getCurrentTrack = function () {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/me/player/currently-playing').then(function (result) {
            resolve(result);
        });
    })
}

SpotifyService.prototype.getAccessToken = function () {
    try {
            return this.req.session.spotifyAccessToken; //JSON.parse(fs.readFileSync(os.homedir() + '/.bungalow/spotify_access_token.json'));
    } catch (e) {
        return null;
    }
}


SpotifyService.prototype.isAccessTokenValid = function () {
    var access_token = this.getAccessToken();
    if (!access_token) return false;
    return new Date() < new Date(access_token.time) + access_token.expires_in * 1000;
}


SpotifyService.prototype.refreshAccessToken = function () {
    var self = this;
    return new Promise(function (resolve, fail) {
        var refresh_token = self.session.refresh_token;
        request({
            url: 'https://accounts.spotify.com/api/token',
            method: 'POST',
            form: {
                grant_type: 'refresh_token',
                refresh_token: refresh_token,
                redirect_uri: self.apikeys.redirect_uri
            },
            headers: {
                'Authorization': 'Basic ' + new Buffer(self.apikeys.client_id + ':' + self.apikeys.client_secret).toString('base64')
            }
        }, function (error, response, body) {
            var result = JSON.parse(body);
            if (error || 'error' in result) {
                fail();
                return;
            }
            console.log(self.apikeys);
            self.session = result;
            self.session.issued = new Date().getTime();
            self.session.refresh_token = refresh_token;
            music.res.clearCookie('spotify');
            music._request('GET', '/me', {}, {}).then(function (user) {
                result.user = user;
                music.res.cookie('spotify', JSON.stringify(result));
                console.log("Refresh", result);
                resolve(result);
            })
        });
    });
}


var service = {
    id: 'spotify',
    uri: 'service:spotify',
    type: 'service',
    name: 'Spotify',
    description: 'Music service'
};


SpotifyService.prototype.searchFor = function (q, type, offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/search', {
            q: q,
            type: type,
            offset: offset,
            limit: limit
        }).then(function (result) {
            resolve(result);
        }, function (err) {
            fail(err);
        });
    });
}


SpotifyService.prototype._request = function (method, path, payload, postData) {
    var self = this;
    return new Promise(function (resolve, fail) {
        if (!payload) payload = {};
        if (!payload.offset) payload.offset = 0;
        if (!isNaN(payload.offset)) payload.offset = parseInt(payload.offset);
        if (!payload.type) payload.type = 'track';
        if (!isNaN(payload.limit)) payload.limit = parseInt(payload.limit);
        if (!payload.limit) payload.limit = 30;
        
        function _do(_resolve, _fail) {
        
            var cachePath = path + '?offset=' + payload.offset + '&limit=' + payload.limit + '&q=' +payload.q + '&type=' + payload.type + '&snapshot_id=' + payload.snapshot_id;
            
            if (method == 'GET' && cache.isCached(cachePath) && path.indexOf('/track') == -1) {
                resolve(cache.load(cachePath));
                return;
            }
            
            if (false && method === 'GET' && self.cache instanceof Object && cachePath in self.cache) {
                var result = self.cache[cachePath];
                resolve(result);
                return;
            }
            
            if (!self.session) {
                fail(401);
                return;
            }
            var headers = {};
            
            headers["Authorization"] = "Bearer " + self.session.access_token;
            if (payload instanceof Object) {
                headers["Content-type"] = "application/json";
        
            } else {
                headers["Content-type"] = ("application/x-www-form-urlencoded");
            }
            var url = 'https://api.spotify.com/v1' + path;
            request({
                    method: method,
                    url: url,
                    headers: headers,
                    qs: payload,
                    json: true,
                    body: (postData)
                },
                function (error, response, body) {
                    if (error) {
                        fail(error);
                        return;
                    }
                        function formatObject (obj, i) {
                       obj.position = payload.offset + i; 
                       obj.p = payload.offset + i + 1; 
                       obj.service = service;
                       obj.version = '';
                       if (obj.type == 'country') {
                           obj.president = null;
                            if (obj.id == 'qi') {
                                obj.president = {
                                    id: 'drsounds',
                                    name: 'Dr. Sounds',
                                    uri: 'spotify:user:drsounds',
                                    images: [{
                                        url: 'http://blog.typeandtell.com/sv/wp-content/uploads/sites/2/2017/06/Alexander-Forselius-dpi27-750x500.jpg'
                                    }],
                                    type: 'user'
                                }   
                            }
                           
                       }
                       
                       if (obj.type == 'user') {
                           obj.manages = [];
                           obj.controls = []
                           if (obj.id == 'buddhalow' || obj.id == 'buddhalowmusic' || obj.id == 'drsounds') {
                               obj.president_of = [{
                                   id: 'qi',
                                   name: 'Qiland',
                                   uri: 'country:qi',
                                   type: 'country'
                               }];
                                obj.manages.push({
                                    id: '2FOROU2Fdxew72QmueWSUy',
                                    type: 'artist',
                                    name: 'Dr. Sounds',
                                    uri: 'spotify:artist:2FOROU2Fdxew72QmueWSUy',
                                    images: [{
                                        url: 'http://blog.typeandtell.com/sv/wp-content/uploads/sites/2/2017/06/Alexander-Forselius-dpi27-750x500.jpg'
                                    }]
                                });
                                obj.manages.push({
                                    id: "1yfKXBG0YdRc5wrAwSgTBj",
                                    name: "Buddhalow",
                                    uri: "spotify:artist:1yfKXBG0YdRc5wrAwSgTBj",
                                    type: "artist",
                                    images: [{
                                        url: 'https://static1.squarespace.com/static/580c9426bebafb840ac7089e/t/580d061de3df28929ead74ac/1477248577786/_MG_0082.jpg?format=1500w'
                                    }]
                                });
                            }
                       }
                       if (obj.type == 'artist') {
                           obj.users = [];
                            obj.labels = [];
                            obj.manager = {
                                id: '',
                                name: '',
                                uri: 'spotify:user:',
                                type: 'user',
                                username: ''
                            };
                           if (obj.id == '2FOROU2Fdxew72QmueWSUy') {
                                obj.manager = {
                                   id: 'drsounds',
                                   name: 'Dr. Sounds',
                                   type: 'user',
                                   url: 'spotify:user:drsounds'
                               };
                               obj.users.push({
                                   id: 'drsounds',
                                   name: 'Dr. Sounds',
                                   type: 'user',
                                   url: 'spotify:user:drsounds'
                               });
                               obj.labels.push({
                                   id: 'buddhalowmusic',
                                   name: 'Buddhalow Music',
                                   type: 'label',
                                   uri: 'spotify:label:buddhalowmusic'
                               });
                               obj.labels.push({
                                   id: 'drsounds',
                                   name: 'Dr. Sounds',
                                   type: 'label',
                                   uri: 'spotify:label:drsounds'
                               });
                               obj.labels.push({
                                   id: 'recordunion',
                                   name: 'Record Union',
                                   type: 'label',
                                   uri: 'spotify:label:recordunion'
                               });
                               obj.labels.push({
                                   id: 'substream',
                                   name: 'Substream',
                                   type: 'label',
                                   uri: 'spotify:label:substream'
                               });
                           }
                           
                           
                       }
                      
                       if ('duration_ms' in obj) {
                           obj.duration = obj.duration_ms / 1000;
                       }
                       if (obj.type === 'user') {
                           obj.name = obj.id;
                       }
                       if ('track' in obj) {
                           obj = assign(obj, obj.track);
                       }
                       if ('artists' in obj) {
                           try {
                               obj.artists = obj.artists.map(formatObject);
                           } catch (e) {
                               
                           }
                       }
                  
                       if ('album' in obj) {
                           obj.album = formatObject(obj.album, 0);
                       }
                       if ('display_name' in obj) {
                           obj.name = obj.display_name;
                       }
                       if (obj.name instanceof String && obj.name.indexOf('-') != -1) {
                           obj.version = obj.substr(obj.indexOf('-') + '-'.length).trim();
                           obj.name = obj.name.split('-')[0];
                       }
                       return obj;
                    }
                    try {
                        if (response.statusCode < 200 ||response.statusCode > 299) {
                            console.log(body);
                            fail(response.statusCode);
                            return;
                        }
                        if (body == "") {
                            resolve({
                                status: response.statusCode
                            });
                            return;
                        }
                        var data = (body);
                        if (!data) {
                            console.log(body);
                            fail(response.statusCode);
                        }
                        if ('error' in data || !data) {
                            console.log(body);
                            fail(response.statusCode);
                            return;
                        }
                        data.service = {
                            name: 'Spotify',
                            id: 'spotify',
                            type: 'service',
                            description: ''
                        }
                        if ('items' in data) {
                            data.objects = data.items;
                            delete data.items;
                        }
                        if ('categories' in data) {
                            data.objects = data.categories.items.map((o) => {
                                o.uri = 'spotify:category:' + o.id;
                                o.type = 'category';
                                o.images = o.icons;
                                delete o.icons;
                                return o;
                            });
                            delete data.categories;
                        }
                        if ('tracks' in data) {
                            if (data.tracks instanceof Array) {
                                data.objects = data.tracks;
                            } else {
                                data.objects = data.tracks.items;
                            }
                            delete data.tracks;
                        }
                        if (!('images' in data)) {
                            data.images = [{
                                url: ''
                            }];
                        }
                        if ('album' in data) {
                            data.album = formatObject(data.album);
                            delete data.albums;
                        }
                        
                        if ('owner' in data) {
                            data.owner = formatObject(data.owner);
                            delete data.albums;
                        }
                        if ('artists' in data) {
                            data.objects = data.artists.items;
                        }
                        if ('objects' in data && data.objects && data.type != 'artist') {
                            data.objects = data.objects.map(formatObject);
                           
                        }
                        if ('artists' in data && data.type == 'album') {
                           data.artists = data.artists.map(formatObject);
                        }  
                        if ('albums' in data && data.type != 'artist') {
                           data.objects = data.albums.items.map(formatObject);
                        }  
                        data = formatObject(data, 0);
                        console.log(data);
                        data.updated_at = new Date().getTime();
                        self.cache[cachePath] = data;
                        if (method === 'GET') {
                            cache.save(cachePath, data);
                            fs.writeFileSync(cache_file, JSON.stringify(self.cache));
                        } else {
                            cache.invalidate(cachePath);
                        }
                        resolve(data);
                        
                    } catch (e) {
                        
                        fail(e);
                    }
                }
                
            );
        }
        
        if (self.session != null && new Date().getTime() - self.session.issued < self.session.expires_in * 1000) {
            
             _do(resolve, fail);
        }  else {
           self.refreshAccessToken().then(function (result) {
                _do(resolve, fail);
            });
        }
        
        
    });
}


/**
 * Returns user by id
 **/
SpotifyService.prototype.getUser = function (id) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/users/' + id).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}

/**
 * Returns user by id
 **/
SpotifyService.prototype.getArtist = function (id) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/artists/' + id).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}


SpotifyService.prototype.getReleasesByArtistName = function (id, release_type, offset, limit) {
    var self = this;
    if (!release_type || release_type == "release") release_type = 'single,album';
    return new Promise(function (resolve, fail) {
        self.getArtistByName(id).then(function (artist) {
            self.getReleasesByArtist(artist.id, release_type, offset, limit).then(function (result) {
                resolve(result);
            }, function (err) {
                fail(err);
            })
        }, function (err) {
            fail(err);
        });
    });
    
}


SpotifyService.getReleaseByName = function (release_name, artist_name, release_type, offset, limit) {
    var self = this;
    if (!release_type || release_type == "release") release_type = 'single,album';
    return new Promise(function (resolve, fail) {
        self.search('artist:"' + artist_name + '" AND album:"' + release_name + '"', 0, 1, 'release').then(function (result) {
            self.getRelease(result.objects[0])
        });
    });
    
}



SpotifyService.getTrackByName = function (name, artist_name, release_type, offset, limit) {
    var self = this;
    if (!release_type || release_type == "release") release_type = 'single,album';
    return new Promise(function (resolve, fail) {
        self.search('track:"' + name + '" AND album:"' + artist_name + '"', 0, 1, 'release').then(function (result) {
            resolve(result); 
        });
    });
    
}


/**
 * Returns user by id
 **/
SpotifyService.prototype.getReleasesByArtist = function (id, release_type, offset, limit) {
    var self = this;
    
    if (!release_type || release_type == "release") release_type = 'single,album';
    return new Promise(function (resolve, fail) {
        self._request('GET', '/artists/' + id + '/albums', {
            offset: offset,
            limit: limit,
            album_type: release_type
        }).then(function (result) {
        
            resolve(result);
        }, function (err) {
            console.log(err);
            fail(err);
        });
    });
}



/**
 * Returns user by id
 **/
SpotifyService.prototype.getReleases = function (id, release_type, offset, limit) {
    var self = this;
    
    if (!release_type || release_type == "release") release_type = 'single,album';
    return new Promise(function (resolve, fail) {
        self._request('GET', '/artists/' + id + '/albums', {
            offset: offset,
            limit: limit,
            album_type: release_type
        }).then(function (result) {
        
            resolve(result);
        }, function (err) {
            console.log(err);
            fail(err);
        });
    });
}

/**
 * Returns user by id
 **/
SpotifyService.prototype.getTracksInAlbum = function (id, offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/albums/' + id + '/tracks', {offset: offset, limit: limit}).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}

/**
 * Returns user by id
 **/
SpotifyService.prototype.getPlaylist = function (username, identifier) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/users/' + username + '/playlists/' + identifier).then(function (result) {
           self._request('GET', '/users/' + username + '/playlists/' + identifier + '/tracks').then(function (result2) {
            result.tracks = result2;
            result.snapshot_id = encodeURIComponent(result.snapshot_id);
            resolve(result); 
           });
        }, function (err) {
            fail(err);
        });
    });
}

/**
 * Returns user by id
 **/
SpotifyService.prototype.getCountry = function (code) {
    var self = this;
    return new Promise(function (resolve, fail) {
        if (code == 'qi') {
            resolve({
                id: code,
                uri: 'spotify:country:' + code,
                name: 'Qiland',
                type: 'country',
                service: service,
                images: [{
                    url: 'http://buddhalow.se/wp-content/uploads/2017/12/qi.png'
                }]
            });
            return;
        }
        request({
            url: 'https://restcountries.eu/rest/v2/alpha/' + code
        }, function (err2, response2, body2) {
            
            try {
                var result = JSON.parse(body2);
               
                resolve({
                    id: code,
                    uri: 'spotify:country:' + code,
                    name: result.name,
                    type: 'country',
                    service: service,
                    images: [{
                        url: result.flag
                    }]
                });
            } catch (e) {
                fail(500);
            }
        });
    });
}

SpotifyService.prototype.getTopTracksInCountry = function (code, limit, offset) {
    var self = this;
    return new Promise(function(resolve, fail) {
         if (code == 'qi') {
            var result = { 
                name: 'Qiland',
                id: 'qi',
                service: service
            };
            var url = '/me/top/tracks'; // '/users/drsounds/playlists/2KVJSjXlaz1PFl6sbOC5AU';
            self._request('GET', url).then(function (result) {
                try {
                    request({
                        url: url + '/tracks',
                        headers: headers
                    }, function (err2, response2, body2) {
                        var result3 = JSON.parse(body2);
                        resolve({
                            objects: result3.items.map(function (track, i) {
                                var track = assign(track, track.track);
                                track.user = track.added_by;
                                track.time = track.added_at;
                                track.position = i;
                                track.service = service;
                                if (track.user)
                                track.user.name = track.user.id;
                                track.user.service = service;
                                return track;
                            })
                        });
                    });
                } catch (e) {
                    fail(500);
                }
            }, function (err) {
                fail(500);
            });
        }
        self._request('GET','/browse/categories/toplists/playlists?country=' + code + '&limit=' + limit + '&offset=' + offset).then(function (result2) {
            try {
                self._request('GET', result2.objects[0].href.substr('https://api.spotify.com/v1'.length) + '/tracks').then(function (result3) {
                 
                    resolve({
                        objects: result3.items.map(function (track, i) {
                            var track = assign(track, track.track);
                            track.user = track.added_by;
                            track.album.service = service;
                            track.position = i;
                            track.artists = track.artists.map(function (a) {
                                a.service = service;
                                return a;
                            })
                            track.service = service;
                            track.time = track.added_at;
                            if (track.user)
                            track.user.name = track.user.id;
                            return track;
                        })
                    });
                });
            } catch (e) {
                fail(500);
            }
        }, function (err) {
            fail(500);
        });
    })
}


SpotifyService.prototype.getTopListForCountry = function (code, limit, offset) {
    var self = this;
    return new Promise(function(resolve, fail) {
         if (code == 'qi') {
            resolve({
                id: code,
                uri: 'spotify:country:' + code + ':top:' + limit,
                name: 'Top Tracks',
                type: 'country',
                service: service,
                images: [{
                    url: 'http://buddhalow.se/wp-content/uploads/2017/12/qi.png'
                }],
                in: {
                    id: code,
                    name: 'Qiland',
                    uri: 'spotify:country:' + code
                }
            });
            return;
        }
        request({
            url: 'https://restcountries.eu/rest/v2/alpha/' + code
        }, function (err2, response2, body2) {
            
            try {
                var result = JSON.parse(body2);
               
                resolve({
                    id: code,
                    uri: 'spotify:country:' + code + ':top:' + limit,
                    name: 'Top Tracks',
                    type: 'country',
                    service: service,
                    images: [{
                        url: result.flag
                    }],
                    in: {
                        id: code,
                        name: result.name,
                        uri: 'spotify:country:' + code
                    }
                });
            } catch (e) {
                fail(500);
            }
        });
    })
}

SpotifyService.prototype.getTopTracksInCountry = function (code, limit, offset) {
    var self = this;
    return new Promise(function(resolve, fail) {
         if (code == 'qi') {
            var result = { 
                name: 'Qiland',
                id: 'qi',
                service: service
            };
            var url = '/users/drsounds/playlists/2KVJSjXlaz1PFl6sbOC5AU/tracks';
            self._request('GET', url).then(function (result3) {
        
                resolve({
                    uri: 'spotify:country:' + code + ':top:' + limit + ':track',
                    objects: result3.objects.map(function (track, i) {
                        var track = assign(track, track.track);
                        track.user = track.added_by;
                        track.time = track.added_at;
                        track.position = i;
                        track.service = service;
                        if (track.user)
                        track.user.name = track.user.id;
                        track.user.service = service;
                        return track;
                    })
                });
            }, function (err) {
                fail(500);
            });
            return;
        }
        self._request('GET','/browse/categories/toplists/playlists?country=' + code + '&limit=' + limit + '&offset=' + offset).then(function (result2) {
            try {
                var uri = result2.playlists.items[0].href.substr('https://api.spotify.com/v1'.length) + '/tracks';
                self._request('GET', uri).then(function (result3) {
                    try {
                        resolve({
                            uri: 'spotify:country:' + code + ':top:' + limit + ':track',
                            objects: result3.objects.map(function (track, i) {
                                var track = assign(track, track.track);
                                track.user = track.added_by;
                                track.album.service = service;
                                track.position = i;
                                track.artists = track.artists.map(function (a) {
                                    a.service = service;
                                    return a;
                                })
                                track.service = service;
                                track.time = track.added_at;
                                if (track.user)
                                track.user.name = track.user.id;
                                return track;
                            })
                        });
                    } catch (e) {
                        fail(500);
                    }
                });
            } catch (e) {
                fail(500);
            }
        }, function (err) {
            fail(500);
        });
    })
}

SpotifyService.prototype.reorderTracksInPlaylistSnapshot = function (username, identifier, snapshot_id, range_start, range_length, insert_before) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('PUT', '/users/' + username + '/playlists/' + identifier + '/tracks', {}, {
            range_start: range_start,
            range_length: range_length,
            insert_before: insert_before,
            snapshot_id: snapshot_id
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}

SpotifyService.prototype.replaceTracksInPlaylistSnapshot = function (username, identifier, snapshot_id, uris) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('PUT', '/users/' + username + '/playlists/' + identifier + '/tracks', {}, {
            uris: uris
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}

SpotifyService.prototype.addTracksToPlaylistSnapshot = function (username, identifier, snapshot_id, uris, position) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('POST', '/users/' + username + '/playlists/' + identifier + '/tracks', null, {
            position: position,
            uris: uris
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}


SpotifyService.prototype.deleteTracksFromPlaylist = function (username, identifier, tracks) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('DELETE', '/users/' + username + '/playlists/' + identifier + '/tracks', null, {
           tracks: tracks
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}


/**
 * Returns user by id
 * @remarks The snapshot_id is only for decorative purpose, since we currently can't retrieve tracks for a certain
 * snapshot from the Spotify API. The reason for using the deocrative is that we use the uri spotify:user:<user_id>:playlist:<playlist_id>:snapshot:<snapshot_id>:track
 * to allow for better editing facility
 **/
SpotifyService.prototype.getTracksInPlaylistSnapshot = function (username, identifier, snapshot_id, offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/users/' + username + '/playlists/' + identifier + '/tracks', {
            offset: offset,
            limit: limit
        }).then(function (result) {
             resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}


/**
 * Returns user by id
 **/
SpotifyService.prototype.getTracksInAlbum = function (identifier, offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/albums/' + identifier + '/tracks', {
            offset: offset,
            limit: limit
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}



/**
 * Returns user by id
 **/
SpotifyService.prototype.getPlaylistsByUser = function (username, offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/users/' + username + '/playlists', {
            limit: limit,
            offset: offset
        }).then(function (result) {
           /*Promise.all(result.objects.map(function (playlist) {
                return self.getTracksInPlaylist(playlist.owner.id, playlist.id);
            })).then(function (tracklists) {
                try {
                    for (var i = 0; i < tracklists.length; i++) {
                        result.objects[i].tracks = tracklists[i];
                    }
                    resolve(result); 
                } catch (e) {
                    fail(e);
                }
            }, function (err) {
                fail(err);
            });*/
            resolve(result);
        }, function (err) {
            fail(err);
        });
    });
}



/**
 * Returns user by id
 **/
SpotifyService.prototype.getTrack = function (identifier) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/tracks/' + identifier).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}


/**
 * Returns user by id
 **/
SpotifyService.prototype.getMyPlaylists = function (offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/me/playlists', {
            offset: offset,
            limit: limit
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}


/**
 * Returns user by id
 **/
SpotifyService.prototype.getMyArtists = function (offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/me/artists', {
            offset: offset,
            limit: limit
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}



/**
 * Returns user by id
 **/
SpotifyService.prototype.getRelatedArtistsForArtist = function (identifier, offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/artists/' + identifier + '/related-artists', {
            offset: offset,
            limit: limit
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}


/**
 * Returns user by id
 **/
SpotifyService.prototype.getCategories = function (offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/browse/categories', {
            offset: offset,
            limit: limit
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}


/**
 * Returns user by id
 **/
SpotifyService.prototype.getMyPlaylists = function (offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/me/playlists', {
            offset: offset,
            limit: limit
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}

/**
 * Returns user by id
 **/
SpotifyService.prototype.getCategory = function (id, offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/browse/categories/' + id, {
            offset: offset,
            limit: limit
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}


/**
 * Returns user by id
 **/
SpotifyService.prototype.getPlaylistsInCategory = function (id, offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/browse/categories/' + id + '/playlists', {
            offset: offset,
            limit: limit
        }).then(function (result) {
           resolve({
               objects: result.playlists.items
           }); 
        }, function (err) {
            fail(err);
        });
    });
}


/**
 * Returns user by id
 **/
SpotifyService.prototype.getFeaturedPlaylists = function (offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/browse/featured-playlists', {
            offset: offset,
            limit: limit
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}


/**
 * Returns user by id
 **/
SpotifyService.prototype.getNewReleases = function (offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/browse/new-releases', {
            offset: offset,
            limit: limit
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}


/**
 * Returns user by id
 **/
SpotifyService.prototype.getMyReleases = function (id, offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/me/albums', {
            offset: offset,
            limit: limit
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}

/**
/**
 * Returns user by id
 **/
SpotifyService.prototype.getMyTracks = function (offset, limit) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('GET', '/me/tracks', {
            offset: offset,
            limit: limit
        }).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}



/**
 * Returns user by id
 **/
SpotifyService.prototype.playTrack = function (body) {
    var self = this;
    return new Promise(function (resolve, fail) {
        self._request('PUT', '/me/player/play', {}, body).then(function (result) {
           resolve(result); 
        }, function (err) {
            fail(err);
        });
    });
}

SpotifyService.prototype.request = function (method, url, payload, postData, req, cb) {
    var self = this;
    this.req = req;
    return new Promise(function (resolve, fail) {
        var activity = function () {
            if (!payload.offset) payload.offset = 0;
            if (!isNaN(payload.offset)) payload.offset = parseInt(payload.offset);
            if (!payload.type) payload.type = 'track';
            if (!isNaN(payload.limit)) payload.limit = parseInt(payload.limit);
            if (!payload.limit) payload.limit = 30;
            
            var token = self.getAccessToken();
            var headers = {};
            headers["Authorization"] = "Bearer " + token.access_token;
            if (payload instanceof Object) {
                headers["Content-type"] = "application/json";
    
            } else {
                headers["Content-type"] = ("application/x-www-form-urlencoded");
    
    
            }   

    
            var parts = url.split(/\//);
            console.log(parts);
            if (parts[0] == 'internal') {
                if (parts[1] == 'history') {
                    if (parts[2] === 'track') {
                        url = 'https://api.spotify.com/v1/me/player/recently-played?limit=' + (payload.limit || 39) + '&offset=' + (payload.offset || 1);
                        request({
                                url: url,
                                headers: headers
                            },
                            function (error, response, body) {
                            
                                var data = JSON.parse(body);
                                try {
                                    resolve({'objects': data[payload.type + 's'].items.map((o, i) => {
                                        o.position = i + payload.offset;
                                        return o;
                                    }), 'service': service});
                                } catch (e) {
                                    fail(e);
                                }
                            }
                        );
                    }
                }
                if (parts[1] == 'library')  {
                    if (parts[2] == 'track') {
                        request({
                        url: 'https://api.spotify.com/v1/me/tracks?limit=' + (payload.limit) + '&offset=' + (payload.offset),
                            headers: headers
                        },
                            function (error, response, body) {
                                var data = JSON.parse(body);
                                try {
                                    resolve({
                                        type: 'library',
                                        name: 'Library',
                                        'objects': data.items.map(function (t, i) {
                                            var track = t.track;
                                            track.service = service;
                                            track.position = i + payload.offset;
                                            return track;
                                        })
                                    });
                                } catch (e) {
                                    fail();
                                }
                            }
                        );
                    }
                    resolve({
                        id: 'library',
                        uri: 'internal:library',
                        name: 'Library',
                        type: 'library',
                        description: ''
                    });
                }
            }
            if (parts[0] == 'search') {
                url = 'https://api.spotify.com/v1/search?q=' + payload.q + '&type=' + (payload.type || 'track') + '&limit=' + (payload.limit || 39) + '&offset=' + (payload.offset || 1);
                request({
                        url: url,
                        headers: headers
                    },
                    function (error, response, body) {
                    
                        var data = JSON.parse(body);
                        try {
                            resolve({'objects': data[payload.type + 's'].items.map((o, i) => {
                                o.position = i + payload.offset;
                                return o;
                            }), 'service': service});
                        } catch (e) {
                            fail(e);
                        }
                    }
                );
            }
            if (parts[0] == 'me') {
                if (parts[1] == 'track') {
                    request({
                        url: 'https://api.spotify.com/v1/me/tracks?limit=85&limit=' + (payload.limit || 99) + '&offset=' + (payload.offset || 0) + '&country=se',
                        headers: headers
                        
                    },
                        function (error, response, body) {
                            var data = JSON.parse(body);
                            try {
                                resolve({
                                    type: 'library',
                                    name: 'Library',
                                    'objects': data.items.map(function (t, i) {
                                        var track = t.track;
                                        track.service = service;
                                        track.position = i + payload.offset;
                                        return track;
                                    })
                                });
                            } catch (e) {
                                fail();
                            }
                        }
                    );
                } else if (parts[1] == 'playlist') {
                 request({
                        url: 'https://api.spotify.com/v1/me/playlists?limit=' + (payload.limit || 99) + '&offset=' + (payload.offset || 0) + '&country=se',
                        headers: headers
                        
                    },
                        function (error, response, body) {
                            var data = JSON.parse(body);
                            try {
                                resolve({
                                    type: 'collection',
                                    name: 'Playlists',
                                    'objects': data.items.map(function (s, i){
                                        s.service = service;
                                        s.position = i + payload.offset;
                                        return s;
                                    }),
                                    service: service
                                });
                            } catch (e) {
                                fail(500);
                            }
                        }
                    );
                    
                } else if (parts[1] == 'player') {
                    if (parts[2] == 'play') {
                       
                        var uri = 'https://api.spotify.com/v1/me/player/play';
                        var d = {
                            url: uri,
                            headers: headers,
                            method: method,
                            contentType: 'application/json',
                            body: JSON.stringify(postData)
                        };
                        request(d,
                            function (error, response, body) {
                                if (error) {
                                    fail(500);
                                    return;
                                }
                                request(
                                    'https://api.spotify.com/v1/me/player',
                                    {
                                        headers: headers    
                                    },
                                    function (error2, response2, body2) {
                                         try {
                                            var result = JSON.parse(body2);
                                            result.service = service;
                                            resolve(result);
                                        } catch (e) {
                                            fail(500);
                                        }
                                    return;
                                });
                            }
                        );
                    } else if(parts[2] === 'pause') {
                        var uri = 'https://api.spotify.com/v1/me/player/pause';
                        var d = {
                            url: uri,
                            headers: headers,
                            method: method,
                            contentType: 'application/json',
                            body: JSON.stringify(postData)
                        };
                        request(d,
                            function (error, response, body) {
                                 try {
                                    resolve(JSON.parse(body));
                                } catch (e) {
                                    fail();
                                }
                            return;
                            }
                        )
                    } else if (parts[2] == 'currently-playing') {
                        request(
                            'https://api.spotify.com/v1/me/player/currently-playing',
                            {
                                headers: headers    
                            },
                            function (error2, response2, body2) {
                                 try {
                                     var result = JSON.parse(body2);
                                     result.service = service;
                                    resolve(result);
                                } catch (e) {
                                    fail();
                                }
                            return;
                        });
                    }
                } else {
                    resolve({
                        name: 'Library',
                        uri: 'spotify:me',
                        type: 'library'
                    });
                    return;
                }
            }
            if (parts[0] == 'artist') {
                if (parts.length > 2) {
                    if (parts[2] == 'top') {
                        if (parts.length > 4) {
                            if (parts[4] == 'track') {
                                request({
                                    url: 'https://api.spotify.com/v1/artists/' + parts[1] + '/top-tracks?limit=' + (payload.limit || 99) + '&offset=' + (payload.offset || 0) + '&country=se',
                                    headers: headers
                                },
                                    function (error, response, body) {
                                        var data = JSON.parse(body);
                                        try {
                                            resolve({
                                                type: 'toplist',
                                                name: 'Top Tracks',
                                                'objects': data.tracks.slice(0,parseInt(parts[3])).map(function (t, i) {
                                                    t.service = service;
                                                    t.position = i;
                                                    return t;
                                                }),
                                                service: service
                                            });
                                        } catch (e) {
                                            fail();
                                        }
                                    }
                                );
                            }
                        } else {
                                request({
                                url: 'https://api.spotify.com/v1/artists/' + parts[1] + '',
                                headers: headers
                            },
                            function (error, response, body) {
                                var obj = JSON.parse(body);
                                resolve({
                                    type: 'toplist',
                                    name: 'Top Tracks',
                                    service: service,
                                    description: 'The top ' + parts[3] + ' tracks by <sp-link uri="' + obj.uri + '">' + obj.name + '</sp-link> that have played at most',
                                    for: obj,
                                    uri: obj.uri + ':top:' + parts[3],
                                    images: [{
                                        url: '/images/toplist.svg'
                                    }]
                                });
                            });
                        }
                    }
                    if (parts[2] == 'release') {
                        var limit = (payload.limit || 10);
                        request({
                                url: 'https://api.spotify.com/v1/artists/' + parts[1] + '/albums?limit=' + (payload.limit || 99) + '&offset=' + (payload.offset || 0),
                                headers: headers
                            },
                            function (error, response, body) {
                                var data = JSON.parse(body);
                                try {
                                    resolve({'objects': data.items});
                                } catch (e) {
                                    fail();
                                }
                            }
                        );
                        return;
                    }
                } else {
                    request({
                            url: 'https://api.spotify.com/v1/artists/' + parts[1],
                                headers: headers
                        },
                        function (error, response, body) {
                            try {
                                var data = JSON.parse(body);
                                console.log(data);
                                data.service = service;
                                resolve(data);
                            } catch (e) {
                                fail(500);
                            }
                        }
                    );
                    return;
                }
            }
    
            if (parts[0] == 'album') {
                if (parts.length > 2) {
                    request({
                            url: 'https://api.spotify.com/v1/albums/' + parts[1] + '/tracks',
                                headers: headers
                        },
                        function (error, response, body) {
                            if (error) {
                                fail(500);
                            }
                            try {
                                body = body.replace('spotify:', '');
                            
                                var data = JSON.parse(body);
                            
                                resolve({
                                    'objects': data.items.map(function (t, i) {
                                        t.service = service;
                                        t.position = i;
                                        return t;
                                    }),
                                    service: service
                                });
                            } catch (e) {
                                resolve({
                                    'objects': []
                                })
                            }
                        }
                    );
                } else {
                    request({
                            url: 'https://api.spotify.com/v1/albums/' + parts[1] + '',
                                headers: headers
                        },
                        function (error, response, body) {
                           try {
                                
                            
                                var data = JSON.parse(body);
                                data.service = service;
                                resolve(data);
                            } catch (e) {
                                fail(500);
                            }
                        }
                    );
                }
            }
            if (parts[0] == 'track') {
                request({
                        url: 'https://api.spotify.com/v1/tracks/' + parts[1] + ''
                    },
                    function (error, response, body) {
                        try {
                            var data = JSON.parse(body);
                            data.service = service;
                            resolve(data);
                        } catch (e) {
                            fail();
                        }
                    }
                );
            }
            if (parts[0] == 'country') {
                var code = parts[1];
                if (parts[2] === 'category') {
                    if (parts[4] === 'playlist') {
                        request({
                            url: 'https://api.spotify.com/v1/browse/categories/' + parts[3] + '/playlists?country=' + parts[1] + '&limit=' + payload.limit + '&offset=' + payload.offset,
                            headers: headers
                        }, function (err, response, body) {
                            try {
                                var result = JSON.parse(body);
                                resolve({
                                    objects: result.playlists.map(function (o) {
                                        o.service = service;
                                        return o;
                                    })
                                });
                            } catch (e) {
                                fail(500);
                            }
                        });
                        return;
                    }
                } else if (parts[2] === 'top') {
                    if (parts[4] === 'track') {
                        if (parts[1] == 'qi') {
                            var result = { 
                                name: 'Qiland',
                                id: 'qi',
                                service: service
                            };
                            url = 'https://api.spotify.com/v1/users/drsounds/playlists/2KVJSjXlaz1PFl6sbOC5AU';
                            request({
                                url: url,
                                headers: headers
                            }, function (err, response, body) {
                                try {
                                    request({
                                        url: url + '/tracks',
                                        headers: headers
                                    }, function (err2, response2, body2) {
                                        var result3 = JSON.parse(body2);
                                        resolve({
                                            objects: result3.items.map(function (track, i) {
                                                var track = assign(track, track.track);
                                                track.user = track.added_by;
                                                track.time = track.added_at;
                                                track.position = i;
                                                track.service = service;
                                                if (track.user)
                                                track.user.name = track.user.id;
                                                track.user.service = service;
                                                return track;
                                            })
                                        });
                                    });
                                } catch (e) {
                                    fail(500);
                                }
                            });
                            return;
                        }
                        request({
                            url: 'https://api.spotify.com/v1/browse/categories/toplists/playlists?country=' + parts[1] + '&limit=' + payload.limit + '&offset=' + payload.offset,
                            headers: headers
                        }, function (err, response, body) {
                            try {
                                var result = JSON.parse(body);
                                result = { objects: result.playlists.items };
                                request({
                                    url: result.objects[0].href + '/tracks',
                                    headers: headers
                                }, function (err2, response2, body2) {
                                    var result3= JSON.parse(body2);
                                    resolve({
                                        objects: result3.items.map(function (track, i) {
                                            var track = assign(track, track.track);
                                            track.user = track.added_by;
                                            track.album.service = service;
                                            track.position = i;
                                            track.artists = track.artists.map(function (a) {
                                                a.service = service;
                                                return a;
                                            })
                                            track.service = service;
                                            track.time = track.added_at;
                                            if (track.user)
                                            track.user.name = track.user.id;
                                            return track;
                                        })
                                    });
                                });
                            } catch (e) {
                                fail(500);
                            }
                        });
                        return;
                    } else {
                        if (code === 'qi') {
                            var result = {
                                id: parts[3],
                                uri: 'spotify:country:' + code + ':top:' + parts[3],
                                name: 'Top Tracks',
                                type: 'toplist',
                                service: service,
                                images: [{
                                    url: ''
                                }],
                                in: {
                                    id: 'qi',
                                    type: 'country',
                                    name: 'Qiland',
                                    uri: 'spotify:country:qi',
                                    service: service,
                                    images: [{
                                        url: ''
                                    }]
                                },
                                description: 'The most popular tracks in Qiland'
                            };
                            resolve(result);
                            return;
                        }
                        request({
                            url: 'https://restcountries.eu/rest/v2/alpha/' + code,
                            headers: headers
                        }, function (err2, response2, body2) {
                            
                            try {
                                var result = JSON.parse(body2);
                               
                                resolve({
                                    id: parts[3],
                                    uri: 'spotify:country:' + code + ':top:' + parts[3],
                                    name: 'Top Tracks',
                                    type: 'toplist',
                                    service: service,
                                    images: [{
                                        url: result.flag
                                    }],
                                    in: result,
                                    description: 'The most popular tracks in ' + result.name
                                })
                            } catch (e) {
                                fail(500);
                            }
                        });
                    }
                } else if (parts[2] === 'playlist') {
                    request({
                        url: 'https://api.spotify.com/v1/browse/categories/toplists/playlists?country=' + parts[1] + '&limit=' + payload.limit + '&offset=' + payload.offset,
                        headers: headers
                    }, function (err, response, body) {
                        try {
                            var result = JSON.parse(body);
                            resolve({
                                objects: result.playlists.map(function (p) {
                                    p.service = service;
                                    p.owner.service = service;
                                })
                            });
                        } catch (e) {
                            fail(500);
                        }
                        return;
                    })
                }  else {
                    if (code == 'qi') {
                        resolve({
                            type: 'country',
                            name: 'Qiland',
                            id: 'qi',
                            uri: 'spotify:country:qi',
                            service: service,
                            images: [
                                {
                                    url: ''
                                }    
                            ]
                        })
                    }
                    request({
                        url: 'https://restcountries.eu/rest/v2/alpha/' + code,
                    }, function (error, response, body) {
                        try {
                            var result = JSON.parse(body);
                            result.type = 'country';
                            result.uri = 'spotify:country:' + code;
                            result.service = service;
                            result.images = [{
                                url: result.flag
                            }]
                            resolve(result);
                        } catch (e) {
                            fail(500);
                        }
                    });
                    return;
                    
                }
            }
            if (parts[0] == 'user') {
                var userid = parts[1];
                if (parts.length > 2) {
                    if (parts[2] == 'playlist') {
                        if (parts.length < 4) {
                            payload = {
                                limit: 10,
                                offset: 0
                            };
                            url = 'https://api.spotify.com/v1/users/' + userid + '/playlists?limit=' + (payload.limit || 99) + '&offset=' + (payload.offset || 0)
                            request({
                                url: url,
                                headers: headers
                            }, function (error, response, body) {
                                try {
                                    var result = JSON.parse(body);
                                     resolve({
                                        'objects': result.items.map((p) => {
                                            p.owner.name = p.owner.id;
                                            p.service = service;
                                            p.owner.service = service;
                                            return p;
                                        })
                                    });
                                } catch (e) {
                                    fail(503);
                                }
                               
                            });
                            return;
                        } else {
                            if (parts[4] == 'follower') {
                                var users = [];
                                for (var i = 0; i < 10; i++) {
                                    users.push({
                                        'id': 'follower' + i,
                                        'name': 'Track ' + i,
                                        'uri': 'spotify:user:' + parts[3] + ':follower:' + i,
                                        service: {
                                            id: 'mock',
                                            name: 'Mock',
                                            uri: 'service:mock'
                                        }
                                    });
                                }
                                resolve({
                                    'objects': users,
                                    service: {
                                        id: 'mock',
                                        name: 'Mock',
                                        uri: 'service:mock'
                                    }
                                });
                            } else if (parts[4] == 'track') {
                                url = 'https://api.spotify.com/v1/users/' + parts[1] + '/playlists/' + parts[3] + '/tracks?limit=' + (payload.limit || 50) + '&offset=' + (payload.offset || 0);
                                request({
                                    url: url,
                                    headers: headers
                                }, function (error, response, body) {
                                    try {
                                        var result = JSON.parse(body);
                                        resolve({
                                            'objects': result.items.map(function (track, i) {
                                                var track = assign(track, track.track);
                                                if (track.added_by)
                                                    track.added_by.service = service;
                                                track.user = track.added_by;
                                                track.time = track.added_at;
                                                track.position = parseInt(payload.offset) + i;
                                                track.service = service;
                                                track.album.service = service;
                                                track.artists = track.artists.map(function (a) {
                                                    a.service = service;
                                                    return a;
                                                })
                                                if (track.user) {
                                                    track.user.name = track.user.id;
                                                    track.user.service = service;
                                                }
                                                return track;
                                            })
                                        })
                                    } catch (e) {
                                        fail(500);
                                    }
                                });
                            } else {
                                request({
                                    url: 'https://api.spotify.com/v1/users/' + parts[1] + '/playlists/' + parts[3] + '',
                                    headers: headers
                                }, function (error, response, body) {
                                    try {
                                        var result = JSON.parse(body);
                                        result.owner.name = result.owner.id;
                                        result.service = service;
                                        result.owner.service = service;
                                        resolve(result);
                                    } catch (e) {
                                        fail(500);
                                    }
                                });
                            }
                        }
                    }
    
                } else {
                    console.log("Getting users");
                    request({
                        url: 'https://api.spotify.com/v1/users/' + parts[1] + '',
                        headers: headers
                    },
                        function (error, response, body) {
                            if (error) {
                                fail(500);
                            }
                            try {
                                var user = JSON.parse(body);
                                if (user) {
                                    user.name = user.display_name;
                                    user.service = service;
                                }
                                resolve(user);
                            } catch (e) {
                                fail(500);
                            }
                        }
                    );
    
                }
            }
            if (parts[0] == 'genre') {
                var userid = parts[1];
                if (parts.length > 2) {
                    if (parts[2] == 'playlist') {
                        if (parts.length < 4) {
                            payload = {
                                limit: 10,
                                offset: 0
                            };
                            request({
                                url: 'https://api.spotify.com/v1/browse/categories/' + userid + '/playlists?limit=' + payload.limit + '&offset=' + payload.offset,
                                headers: headers
                            }, function (error, response, body) {
                                try {
                                    var result = JSON.parse(body);
                                
                                    
                                    resolve({
                                        'objects': result.playlists.items.map(function (pls, i) {
                                            pls.service = service;
                                            pls.position = i + payload.offset;
                                        }),
                                        service: service
                                    });
                                } catch (e) {
                                    fail(500);
                                }
                            });
                            return;
                        }
                    }
                } else {
                    console.log("Getting users");
                    request({
                        url: 'https://api.spotify.com/v1/browse/categories/' + parts[1] + '',
                        headers: headers
                    },
                        function (error, response, body) {
                            if (error) {
                                fail({'error': ''});
                            }
                            try {
                                var user = JSON.parse(body);
                                user.images = user.icons;
                                user.service = service;
                                resolve(user);
                            } catch (e) {
                                fail(500);
                            }
                        }
                    );
    
                }
            }
        };
     activity();
    });
}


SpotifyService.prototype.getPlaylistsFeaturingArtist = function (name, exclude, offset, limit) {
    return new Promise(function (resolve, reject) {
        var q = 'name=' + name + '&exclude=' + exclude + '&offset=' + offset + '&limit=' + limit;
        
        if (cache.isCached(q)) {
            var result = cache.load(q);
            resolve(result);
            return;
        }
        
        var promises = [0, 1,2,3].map(function (i) {
            return new Promise(
                function (resolve2, reject2) {
                    offset = parseInt(offset);
                    searchEngine.search('"' + name + '"', 'open.spotify.com/user', 'items(title,link)', '015106568197926965801%3Aif4ytykb8ws', exclude, offset + (i * limit), limit).then(function (result) {
                        var data = {};
                        try {
                            data.objects = result.items.map((o) => {
                                var uri = 'spotify:' + o.link.split('/').slice(3).join(':');
                                return {
                                    id: uri.split(':')[4],
                                    uri: uri,
                                    name: o.title,
                                    type: 'playlist',
                                    user: {
                                        name: uri.split(':')[2],
                                        id: uri.split(':')[2],
                                        uri: 'spotify:user:' + uri.split(':')[2],
                                        name: uri.split(':')[2],
                                        type: 'user'
                                    }
                                }
                            });
                            data.service = result.service;
                            resolve2(data);
                        } catch (e) {
                            console.log(e);
                            reject2(e);
                        }
                    }, function (err) {
                        reject2(err);
                    });
                }
            );
        });
        Promise.all(promises).then(
            function (results) {
                var data = {
                    objects: [],
                    service: {
                        id: 'google',
                        name: 'Google',
                        type: 'service'
                    }
                };
                results.map(function (r) {
                    r.objects.map(function (o) {
                        data.objects.push(o);
                    })
                });
                cache.save(q, data);
                resolve(data);
            }
        ).catch(function (errors) {
            console.log(errors);
            reject(errors);
        });;
    })
}




SpotifyService.prototype.getPlaylistsFeaturingRelease = function (name, artist, exclude, offset, limit) {
    return new Promise(function (resolve, reject) {
        var q = 'name=' + name + '&exclude=' + exclude + '&offset=' + offset + '&limit=' + limit;
        var filePath = os.homedir() + '/.bungalow/cache/' + md5(q) + '.json';
        
        if (fs.existsSync(filePath)) {
            var result = JSON.parse(fs.readFileSync(filePath));
            resolve(result);
            return;
        }
        
        var promises = [0, 1,2,3].map(function (i) {
            return new Promise(
                function (resolve2, reject2) {
                    offset = parseInt(offset);
                    searchEngine.search('"' + artist  + ' - ' + name + '"', 'open.spotify.com/user', 'items(title,link)', '015106568197926965801%3Aif4ytykb8ws', exclude, offset + (i * limit), limit).then(function (result) {
                        var data = {};
                        try {
                            data.objects = result.items.map((o) => {
                                var uri = 'spotify:' + o.link.split('/').slice(3).join(':');
                                return {
                                    id: uri.split(':')[4],
                                    uri: uri,
                                    name: o.title,
                                    type: 'playlist',
                                    user: {
                                        name: uri.split(':')[2],
                                        id: uri.split(':')[2],
                                        uri: 'spotify:user:' + uri.split(':')[2],
                                        name: uri.split(':')[2],
                                        type: 'user'
                                    }
                                }
                            });
                            data.service = result.service;
                            resolve2(data);
                        } catch (e) {
                            console.log(e);
                            reject2(e);
                        }
                    }, function (err) {
                        reject2(err);
                    });
                }
            );
        });
        Promise.all(promises).then(
            function (results) {
                var data = {
                    objects: [],
                    service: {
                        id: 'google',
                        name: 'Google',
                        type: 'service'
                    }
                };
                results.map(function (r) {
                    r.objects.map(function (o) {
                        data.objects.push(o);
                    })
                });
                fs.writeFileSync(filePath, JSON.stringify(data));
                resolve(data);
            }
        ).catch(function (errors) {
            console.log(errors);
            reject(errors);
        });;
    })
}


SpotifyService.prototype.requestAccessToken = function (code) {
    var self = this;
    var promise = new Promise(function (resolve, fail) {
        var headers = {};
        headers["Authorization"] = "Basic " + new Buffer(self.apikeys.client_id).toString() + ':' + new Buffer(self.apikeys.client_secret);

        headers["Content-type"] = ("application/x-www-form-urlencoded");


            request({
                url: 'https://accounts.spotify.com/api/token',
                headers: headers, form: "grant_type=authorization_code&code=" + code + "&redirect_uri=" + encodeURI(self.apikeys.redirect_uri)},
            function (error, response, body) {
                var data = JSON.parse(body);
                if (!('accessToken' in data)) {
                    fail({'error': 'Request problem'});
                    return;
                }
                self.setSession(data);
                self.nodeSpotifyService.getMe().then(function (data) {
                    resolve(data);
                });

            }
        );
    });
    return promise;
}


SpotifyService.prototype.addToCache = function (resource) {
}

SpotifyService.prototype.events = {};

SpotifyService.prototype.notify = function (event) {
    var type = event.type;
    if (type in this.events) {
        this.events[type].call(this, event);
    }
}

SpotifyService.prototype.addEventListener = function (event, callback) {
    this.events[event] = callback;
}

SpotifyService.prototype.ready = function () {

}

SpotifyService.prototype.getPosition = function () {
    return this.SpotifyBrowse.player.currentSecond;
}

SpotifyService.prototype.logout = function () {
    this.SpotifyBrowse.logout();
}

SpotifyService.prototype.stop = function () {
}

SpotifyService.prototype.getImageForTrack = function (id, callback) {
    this.request('GET', 'https://api.spotify.com/v1/tracks/' + id).then(function (track) {
        callback(track.album.images[0].url);
    });
}

SpotifyService.prototype.seek = function (position) {
}

SpotifyService.prototype.login = function () {
    console.log("Log in");
    var self = this;
    var promise = new Promise(function (resolve, fail) {
        alert("AFFF");
        var win = gui.Window.get(window.open('https://accounts.spotify.com/authorize/?client_id=' + this.apikeys.client_id + '&response_type=code&redirect_uri=' + encodeURI(this.apiKeys.redirect_uri) + '&scope=streaming%20user-read-private%20user-read-email&state=34fFs29kd09', {
            "position": "center",
            "focus": true,
            "toolbar": false,
            "frame": true
        }));
        console.log(win);
        alert(win);
        var i = setInterval(function () {
            if (!win) {
                clearInterval(i);
                var code = localStorage.getItem("code", null);
                if (code) {
                    self.requestAccessToken(code, function () {
                        resolve();
                    }, function () {
                        fail();
                    })
                }
            }
        }, 99);
    });
    return promise;
}

SpotifyService.followPlaylist = function (playlist) {
    
}

var Uri = function (uri) {
    this.parts = uri.split(/\:/);
    this.user = parts[2];
    this.playlist = parts[4];
    this.id = parts[3];
}


SpotifyService.prototype.getAlbumTracks = function (id) {

    var self = this;
    var promise = new Promise(function (resolve, fail) {
        self._request("GET", "/albums/" + id + "/tracks").then(function (data) {
            resolve(data);
        }, function (err) {
            fail(err);
        });
    });
    return promise;
    
};


SpotifyService.prototype.getFolders = function (id) {

    var self = this;
    var promise = new Promise(function (resolve, fail) {
        self._request("GET", "/me/folders").then(function (data) {
            resolve(data);
        }, function (err) {
            fail(err);
        });
    });
    return promise;
};

SpotifyService.prototype.getFolderById = function (id) {

    var self = this;
    var promise = new Promise(function (resolve, fail) {
        self._request("GET", "/me/folders/" + id).then(function (data) {
            resolve(data);
        }, function (err) {
            fail(err);
        });
    });
    return promise;
};



SpotifyService.prototype.getPlaylistsInFolder = function (id) {

    var self = this;
    var promise = new Promise(function (resolve, fail) {
        self._request("GET", "/me/folders/" + id).then(function (data) {
            resolve(data);
        }, function (err) {
            fail(err);
        });
    });
    return promise;
};



SpotifyService.prototype.search = function (query, offset, limit, type) {
    var self = this;
    var promise = new Promise(function (resolve, fail) {
        self._request('GET', '/search', {
            q: (query),
            limit: limit,
            offset: offset,
            type: type
        }).then(function (data) {
            resolve(data);
        }, function (err) {
            fail(err);
        });
    });
    return promise;
};
SpotifyService.prototype.loadPlaylist = function (user, id, callback) {
    var self = this;
    var promise = new Promise(function (resolve, fail) {
        self.request("GET", "/users/" + user + "/playlists/" + id + "/tracks").then(function (tracklist) {
            self.request("GET", "/users/" + uri.user + "/playlists/" + uri).then(function (playlist) {
                playlist.tracks = tracklist.tracks.items;
                resolve(playlist);
            });
        }, function (err) {
            fail(err);
        });
    });
    return promise;
}

SpotifyService.prototype.createPlaylist = function (data) {
    var self = this;

    var promise = new Promise(function (resolve, fail) {
        self.getMe().then(function (me) {
            self._request("POST", "/users/" + me.id + "/playlists", null, data).then(function (object) {
                resolve(object);
            }, function (err) {
                fail(err);
            });
        }, function (err) {
            fail(err);
        });
    });
    return promise;
};

SpotifyService.prototype.getTopList = function (uri, callback) {

}

SpotifyService.prototype.getUserPlaylists = function () {
    var self = this;
    var promise = new Promise(function (resolve, fail) {
        var user = self.getMe();
        self.request("GET", "/users/" + user.id + '/playlists').then(function (data) {
            resolve({
                'objects': data.items
            });
        }, function (err) {
            fail(err);
        });
    });
    return promise;
}


SpotifyService.prototype.getTopTracksForArtist = function (id, country, offset, limit) {
    var self = this;

    var promise = new Promise(function (resolve, fail) {
        self._request("GET", "/artists/" + id + '/top-tracks', {
            country: country
        }).then(function (data) {
            resolve(data);
        }, function (err) {
            fail(err);
        }, function (err) {
            fail(err);
        });
    });
    return promise;
}

SpotifyService.prototype.getAlbum = function (id) {
    var self = this;
    var promise = new Promise(function (resolve, fail) {
        self._request('GET', '/albums/' + id).then(function (album) {
            album.image = album.images[0].url;
            album.tracks = [];
            resolve(album);
        }, function (err) {
            fail(err);
        });
    });
    return promise;
}

SpotifyService.prototype.resolveTracks = function (uris, callback) {

}

SpotifyService.prototype.getPlaylistTracks = function (user, playlist_id, page, callback) {
    var self = this;
    var promise = new Promise(function (resolve, fail) {
         self._request('GET', '/users/' + user + '/playlists/' + playlist_id).then(function (data) {
             resolve({
                 'objects': data.tracks.items
             });
         }, function (err) {
            fail(err);
        });
    });
    return promise;
}

SpotifyService.prototype.playPause = function () {
    if (this.isPlaying) {
        this.pause();
    } else {
        this.resume();
    }
}
SpotifyService.prototype.pause = function () {
    this.isPlaying = false;
}
SpotifyService.prototype.resume = function () {
    this.isPlaying = true;
}
SpotifyService.prototype.reorderTracks = function (playlistUri, indices, newPosition) {
    console.log("SpotifyBrowse is now reordering tracks");
    console.log("Done successfully");
}

SpotifyService.prototype.removeTracks = function (playlist, indices) {
    playlist.reorderTracks(indices, newPosition);
}

SpotifyService.prototype.addTracks = function (playlist, tracks, position) {
    playlist.addTracks(tracks, position);
}


var music = new SpotifyService();

var app = express();

app.use(cookieParser());

app.use(function (req, res, next) {
    music.req = req;
    music.res = res;
   var session = req.cookies['spotify'];
    if (!!session)
       music.session = JSON.parse(session);
      next();
});


app.get('/login', function (req, res) {
    res.redirect(music.getLoginUrl());
});

app.get('/authenticate', function (req, res) {
    console.log("Got authenticate request");
    console.log(req);
    music.authenticate(req, function (err, session) {
         if (err != null) {
            res.status(err).send({error: err});
            res.send();
        }
        console.log("success");
        res.clearCookie('spotify');
        res.statusCode = 200;
        music._request('GET', '/me', {}, {}).then(function (result) {
            session.user = result;
            var strSession = JSON.stringify(session);
            res.cookie('spotify', strSession);
            res.json(session);
            res.send();
        })
    });
}); 


app.get('/login', function (req, res) {
    res.redirect(music.getLoginUrl());
});


app.get('/me/playlist', function (req, res) {
    music.getMyPlaylists(req.query.offset || 0, req.query.limit || 50).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
})
app.get('/user/:username/playlist', function (req, res) {
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getPlaylistsByUser(req.params.username, req.query.offset, req.query.limit).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/label/:username/playlist', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getPlaylistsByUser(req.params.username, req.query.offset, req.query.limit).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});

app.get('/user/:username', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getUser(req.params.username).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/curator/:username/playlist', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getPlaylistsByUser(req.params.username, req.query.offset, req.query.limit).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/curator/:username', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getUser(req.params.username).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});

app.get('/me/playlist', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getMyPlaylists(req.query.offset, req.query.limit).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});

app.get('/me/folder', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getFolders(req.query.offset, req.query.limit).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});

app.get('/me/release', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }   
    music.getMyReleases(req.query.offset, req.query.limit).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});



app.get('/internal/library', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    res.json({
        id: 'library',
        name: 'Library',
        uri: 'internal:library',
        description: 'My Library',
        type: 'library'
    });
});



app.put('/me/player/play', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.playTrack(body).then(function (result) {
        music.getCurrentTrack().then(function (result) {
            res.json(result);
            
        });
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/me/player/currently-playing', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getCurrentTrack(body).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});



app.get('/internal/library/track', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getMyTracks(req.query.offset, req.query.limit).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});

app.get('/category', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getCategories(req.query.offset, req.query.limit).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/category/:identifier', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getCategory(req.params.identifier, req.query.offset, req.query.limit).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/label/:identifier', function (req, res) {
    /*wiki.req = req;
    var name = decodeURIComponent(req.params.identifier);
    wiki.describe(name).then(function (description) {
        res.json({
            name: name,
            description: description || ''
        });
    });*/
    res.json({
        id: req.params.identifier,
        name: req.params.identifier
    });
});




app.get('/label/:identifier/release', function (req, res) {
       
    var name = decodeURIComponent(req.params.identifier);
    music.search('label:"' + req.params.identifier + '"', req.params.limit, req.params.offset, 'album').then(function (result) {
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/category/:identifier/playlist', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getPlaylistsInCategory(req.params.identifier, req.query.offset, req.query.limit).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/search', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.search(req.query.q, req.query.limit, req.query.offset, req.query.type).then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/search/:query/track', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.search(req.params.query,req.query.offset, req.query.limit, 'track').then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/search/:query/artist', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.search(req.params.query, req.query.limit, req.query.offset, 'artist').then(function (result) {
    
        res.json(result);
    }, function (reject) {
        res.json(reject);
    });
});


app.get('/search/:query/release', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.search(req.params.query, req.query.limit, req.query.offset, 'album').then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/search/:query/album', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.search(req.params.query, req.query.limit, req.query.offset, 'album').then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/search/:query/playlist', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.search(req.query.q, req.query.limit, req.query.offset, 'playlist').then(function (result) {
    
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/user/:username/playlist/:identifier', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getPlaylist(req.params.username, req.params.identifier).then(function (result) {
        
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.get('/user/:username/playlist/:identifier/snapshot/:snapshot_id/track', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getTracksInPlaylistSnapshot(req.params.username, req.params.identifier, req.params.snapshot_id, req.query.offset, req.query.limit).then(function (result) {
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.post('/user/:username/playlist/:identifier/snapshot/:snapshot_id/track', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.addTracksToPlaylistSnapshot(req.params.username, req.params.identifier, req.params.snapshot_id, body.uris, body.position).then(function (result) {
        res.json(result);
    }, function (err) {
        res.status(err).send({error: err});
    });
});


app.put('/user/:username/playlist/:identifier/snapshot/:snapshot_id/track', function (req, res) {
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    if ('range_start' in body) {
        music.reorderTracksInPlaylistSnapshot(req.params.username, req.params.identifier, req.params.snapshot, body.range_start, body.range_length + 1, parseInt(body.insert_before)).then(function (result) {
            res.json(result);
        }, function (err) {
            res.status(err).send({error: err});
        });
    } else {
        music.replaceTracksInPlaylistSnapshot(req.params.username, req.params.identifier, req.params.snapshot_id, body.uris).then(function (result) {
            res.json(result);
        }, function (err) {
            res.status(500).send({error: err});
        });
    }
});


app.get('/artist/:identifier', function (req, res) {
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getArtistByName(req.params.identifier).then(function (result) {
        res.json(result).send();
    }, function (error) {
        res.status(500).json(error).send();
    })
    
});


app.get('/artist/:identifier/playlist', function (req, res) {
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getArtistByName(req.params.identifier).then(function (artist) {
        var manager_id = '';
        if ('manager' in artist) {
            manager_id = artist.manager.id;
        }
        var offset = req.query.offset || 0;
        music.getPlaylistsFeaturingArtist(artist.name, manager_id, offset, 10).then(function (result) {
            res.json(result).send(); 
        }, function (err) {
            res.status(500).json(err).send();
        });
    }, function (error) {
        res.status(500).json(error).send();
    })
});



app.get('/album/:identifier/playlist', function (req, res) {
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getAlbum(req.params.identifier).then(function (release) {
        music.getPlaylistsFeaturingRelease(release.name, release.artists[0].name, '', req.query.offset, 10).then(function (result) {
            res.json(result).send(); 
        }, function (err) {
            res.status(500).json(err).send();
        });
    }, function (error) {
        res.status(500).json(error).send();
    })
});


app.get('/release/:identifier/playlist', function (req, res) {
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getAlbum(req.params.identifier).then(function (release) {
        music.getPlaylistsFeaturingRelease(release.name, '', req.query.offset, 10).then(function (result) {
            res.json(result).send(); 
        }, function (err) {
            res.status(500).json(err).send();
        });
    }, function (error) {
        res.status(500).json(error).send();
    })
});


app.get('/artist/:artist_id/album/:album_id', function (req, res) {
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    
     music.getAlbum(req.params.identifier).then(function (result) {
        res.json(result).send(); 
    }, function (err) {
        res.status(500).json(err).send();
    });
   
});


app.get('/artist/:identifier/info', function (req, res) {
    
    music.getArtistByName(req.params.identifier).then(function (artist) {
        music.getPlaylistsFeaturingArtist(artist.name, 0).then(function (result) {
            musicInfo.getArtistInfo(result.name).then(function (artistInfo) {
               res.json(artistInfo);
            }, function (err) {
                res.status(err).send({error: err});
            });
        }, function (err) {
            res.status(500).json(err).send();
        });
    }, function (error) {
        res.status(500).json(error).send();
    })
   
})



app.get('/artist/:identifier/about', function (req, res) {
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    
    music.getArtistByName(req.params.identifier).then(function (result) {
        var data = {
            monthlyListners: 0,
            weeklyListeners: 0,
            dailyListeners: 0,
            discoveredOn: {
                objects: []
            },
            rank: 1000000,
            biography: null
        };
        wiki.describe(result.name).then(function (description) {
            if (description == null) {
                wiki.describe(result.name + ' (Music artist)').then(function (description) {
                    if (result.description != null) {   
                        data.biography = {
                            service: {
                                id: 'wikipedia',
                                name: 'Wikipedia',
                                uri: 'service:wikipedia',
                                type: 'service',
                                images: [{
                                    url: ''
                                }]
                            },
                            body: description
                        };
                    }
                    res.json(data);
                }, function (err) {
                    res.status(500).send({error: reject});
                });
                return;
            }
            data.biography = {
                service: {
                    id: 'wikipedia',
                    name: 'Wikipedia',
                    uri: 'service:wikipedia',
                    type: 'service',
                    images: [{
                        url: ''
                    }]
                },
                body: description
            };
            res.json(data);
        }, function (err) {
            res.status(500).send({error: reject});
        });
    }, function (reject) {
        res.status(500).send({error: reject});
    });
});

app.get('/artist/:identifier/top/:count', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getArtistByName(req.params.identifier).then(function (result) {
        music.getTopTracksForArtist(result.id, 'se').then(function (toplist) {
            toplist.objects = toplist.  objects.slice(0, req.params.count);
            res.json({
                name: 'Top Tracks',
                type: 'toplist',
                images: [{
                    url: '/images/toplist.svg'
                }],
                id: 'toplist',
                uri: result.uri + ':top:' + req.params.count,
                description: 'Top ' + req.params.count + ' tracks for <sp-link uri="' + result.uri + '">' + result.name + '</sp-link>',
                tracks: toplist
            });
        }, function (err) {
            res.statusCode = 500;
            res.json(err);
        });
    }, function (reject) {
        res.status(500).send({error: reject});
    }, function (err) {
        res.status(500).send({error: reject});
        res.json(err);
    });
});


app.get('/artist/:identifier/top/:count/track', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    music.getArtistByName(req.params.identifier).then(function (artist) {
       music.getTopTracksForArtist(artist.id, 'se', req.params.offset, req.params.limit).then(function (result) {
           result.objects = result.objects.slice(0, req.params.count);
           res.json(result);
            res.send();
        }, function (reject) {
            res.status(500).send({error: reject});
            res.send();
        });
    }, function (err) {
        res.status(err).send({error: err});
    });
    
});

app.get('/artist/:identifier/release', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    
        music.getReleasesByArtistName(req.params.identifier, 'release', req.query.offset, req.query.limit).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
});


app.get('/artist/:identifier/album', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    
    music.getReleasesByArtistName(req.params.identifier, 'album', req.query.offset, req.query.limit).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500);
        res.send();
    });
});



app.get('/artist/:identifier/single', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
        
    music.getReleasesByArtistName(req.params.identifier, 'single', req.query.offset, req.query.limit).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
});


app.get('/artist/:identifier/appears_on', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    console.log(req.query);
    music.getReleasesByArtistName(req.params.identifier, 'appears_on', req.query.offset, req.query.limit).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
});


app.get('/artist/:identifier/compilation', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    
    music.getReleasesByArtistName(req.params.identifier, 'compilation', req.query.offset, req.query.limit).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
});


app.get('/album/:identifier', function (req, res) {
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    
    music.getAlbum(req.params.identifier).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
});

app.get('/album/:identifier/track', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    
    music.getTracksInAlbum(req.params.identifier, req.query.offset, req.query.limit).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
});


app.get('/artist/:artist/album/:identifier/track', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    
    music.getTracksInAlbum(req.params.identifier, req.query.offset, req.query.limit).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
});


app.get('/country/:identifier', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    
    music.getCountry(req.params.identifier).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
});


app.get('/country/:identifier/top/:limit', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    
    music.getTopListForCountry(req.params.identifier, req.params.limit).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
});


app.get('/country/:identifier/top/:limit/track', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }
    
    music.getTopTracksInCountry(req.params.identifier, req.params.limit).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
});

app.get('/featured/playlist', function (req, res) {
    
    
    
    var body = {};
    if (req.body) {
        body = (req.body);
    }   
    music.getFeaturedPlaylists(req.query.offset, req.query.limit).then(function (result) {
    
        res.json(result);
        res.send();
    }, function (reject) {
        res.json(reject);
        res.send();
    });
});

app.get('/track/:identifier', function (req, res) {
    
    music.getTrack(req.params.identifier).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
})

app.get('/track/:identifier/track', function (req, res) {
    
    music.getTrack(req.params.identifier).then(function (result) {
        res.json({
            objects: [result]
        });
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
})

app.get('/artist/:artist_name/release/:release_name/track/:track_name', function (req, res) {
    
    music.getTrackByName(req.params.artist_name, req.params.release_name, req.params.track_name).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
})


app.get('/upc/:upc', function (req, res) {
    
    music.getReleaseByUPC(req.params.upc).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
})


app.get('/isrc/:identifier', function (req, res) {
    
    music.getTrack(req.params.identifier).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
})



app.get('/category/:identifier/playlist', function (req, res) {
    
    music.getPlaylistsInCategory(req.params.identifier).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.json(reject);
        res.send();
    });
})

app.get('/category/:identifier', function (req, res) {
    
    music.getCategory(req.params.identifier).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
})

app.get('/category', function (req, res) {
    
    music.getCategories(req.params.identifier).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
})


app.post('/me/playlist', function (req, res) {
    music.createPlaylist(req.body).then(function (result) {
        res.json(result);
        res.send();
    }, function (reject) {
        res.status(500).send({error: reject});
        res.send();
    });
})
module.exports = {
    app: app
};  

