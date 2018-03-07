'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3({
  signatureVersion: 'v4',
});
const Sharp = require('sharp');

const BUCKET = process.env.BUCKET;
const URL = process.env.URL;
exports.handler = function(event, context, callback) {
  let regexp = new RegExp(
    '^/?(\\d{1,3})/((\\d{1})?/?)(images/)?(products|blocks)/(\\d{1,4})/(\\d{1,4})/([\\w\\.\\-]+)$', "i"
  );
  const maxAge = 90 * 24 * 60 * 60;  
  const key = event.queryStringParameters.key;
  let originalKey = '';
  let match = key.match(regexp);
  let ContentType = '';
  const redirectKey = key.replace(/^\/*/,'');
  console.log({"msg": "Seeing if it matches resize request", key, match, regexp});
  if (match === null) {
    regexp = new RegExp("^/?(\\d{1,3})/files/(\\d{1,3})/([\\w\\.\\-]+)$");
    match = key.match(regexp);
    if (match === null) {
      regexp = new RegExp("^/?(\\d{1,3})/images/([^/]+)/([\\w\\.\\-]+)$");
      match = key.match(regexp);
      originalKey = "catalog/" + match[2] + "/images/" + match[3];
      let extension = match[3].match(/\.([^\.]+)$/)[1];
      ContentType = "image/" + extension;
    } else {
      originalKey = "files/" + match[2] + "/" + match[3];
      ContentType = 'application/octet-stream';
    }
    return S3.getObject({Bucket: BUCKET, Key: originalKey}).promise()
           .then(data => 
             S3.putObject({
               Body: data.Body,
               Bucket: BUCKET,
               Key: key,
	       CacheControl: `max-age=${maxAge}`,
	       ContentType: ContentType
             }).promise()
           )
           .then(() => 
	     callback(null, {
               statusCode: '301',
               headers: {
	 	 'location': `${URL}${redirectKey}`,
		 'Cache-Control': "max-age=0",
	       },
               body: '',
             })
           ).catch(err => { console.log(`Could not find key: ${originalKey}`); callback(err); }); 
  }
  let width = parseInt(match[6], 10);
  let height = parseInt(match[7], 10);
  if (width === 0 && height === 0) {
      width = 2560;
  }
  const path = match[8];
  const folder = match[5];
  originalKey = "catalog/" + folder + "/images/" + path;
  let version = parseInt(match[2] || 1, 10);
  let resizeFunc = (data) => {
    return Sharp(data.Body).resize(width || null, height || null).toBuffer({resolveWithObject:true});
  }
  if (version === 2) {
    resizeFunc = (data) => {
      let sharp = Sharp(data.Body)
        .resize(width || null, height || null)
        .background({r: 255, g: 255, b: 255, alpha: 1});
        if (!(width === 0 || height === 0)) {
	  sharp.embed();
	}
        return sharp.toBuffer({resolveWithObject:true});
    } 
  }
  console.log({version,path,folder,width,height,originalKey});
  S3.getObject({Bucket: BUCKET, Key: originalKey}).promise()
    .then(resizeFunc)
    .then(buffer => S3.putObject({
        Body: buffer.data,
        Bucket: BUCKET,
	    ContentType: (buffer.info || {format:"image/jpeg"}).format,
        Key: key,
	CacheControl: `max-age=${maxAge}`
      }).promise()
    )
    .then(() => callback(null, {
        statusCode: '301',
        headers: {
		'location': `${URL}${redirectKey}`,
		 "Cache-Control": "max-age=0",
	},
        body: '',
      })
    )
    .catch(err => callback(err))
}
