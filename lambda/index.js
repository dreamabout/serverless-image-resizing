'use strict';

const AWS = require('aws-sdk');
const S3 = new AWS.S3({
  signatureVersion: 'v4',
});
const Sharp = require('sharp');

const BUCKET = process.env.BUCKET;
const URL = process.env.URL;

exports.handler = function(event, context, callback) {
  const key = event.queryStringParameters.key;
  const match = key.match(new RegEx(
	  "^/(?<shopId>\d{1,3})/((?<version>\d{1})?/?)(images/)?(?<folder>products|blocks)/(?<width>\d{1,4})/(?<height>\d{1,4})/(?<path>[\w\.\-]+)$"));
  const width = parseInt(match["width"], 10);
  const height = parseInt(match["height"], 10);
  const path = match["path"];
  const folder = match["folder"];
  const originalKey = "catalog/" + folder + "/images/" + path;
  let version = parseInt(match["version"] || 1, 10);
  let resizeFunc = (data) => {
    return Sharp(data.body).resize(width || null, height || null).png().toBuffer()
  }
  if (version === 2) {
    resizeFunc = (data) => {
      return Sharp(data.body).resize(width, height).embed().png().toBuffer();
    } 
  }
  S3.getObject({Bucket: BUCKET, Key: originalKey}).promise()
    .then(resizeFunc)
    .then(buffer => S3.putObject({
        Body: buffer,
        Bucket: BUCKET,
        ContentType: 'image/png',
        Key: key,
      }).promise()
    )
    .then(() => callback(null, {
        statusCode: '301',
        headers: {'location': `${URL}/${key}`},
        body: '',
      })
    )
    .catch(err => callback(err))
}
