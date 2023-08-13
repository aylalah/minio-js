/*
 * MinIO Javascript Library for Amazon S3 Compatible Cloud Storage, (C) 2015, 2016 MinIO, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as Crypto from "crypto";
import JSONParser from 'json-stream';
import _ from 'lodash';
import Through2 from 'through2';
import * as errors from "./errors.mjs";
import { isFunction } from "./internal/helper.mjs";
import * as xmlParsers from "./xml-parsers.mjs";

// getConcater returns a stream that concatenates the input and emits
// the concatenated output when 'end' has reached. If an optional
// parser function is passed upon reaching the 'end' of the stream,
// `parser(concatenated_data)` will be emitted.
export function getConcater(parser, emitError) {
  var objectMode = false;
  var bufs = [];
  if (parser && !isFunction(parser)) {
    throw new TypeError('parser should be of type "function"');
  }
  if (parser) {
    objectMode = true;
  }
  return Through2({
    objectMode
  }, function (chunk, enc, cb) {
    bufs.push(chunk);
    cb();
  }, function (cb) {
    if (emitError) {
      cb(parser(Buffer.concat(bufs).toString()));
      // cb(e) would mean we have to emit 'end' by explicitly calling this.push(null)
      this.push(null);
      return;
    }
    if (bufs.length) {
      if (parser) {
        this.push(parser(Buffer.concat(bufs).toString()));
      } else {
        this.push(Buffer.concat(bufs));
      }
    }
    cb();
  });
}

// Generates an Error object depending on http statusCode and XML body
export function getErrorTransformer(response) {
  var statusCode = response.statusCode;
  var code, message;
  if (statusCode === 301) {
    code = 'MovedPermanently';
    message = 'Moved Permanently';
  } else if (statusCode === 307) {
    code = 'TemporaryRedirect';
    message = 'Are you using the correct endpoint URL?';
  } else if (statusCode === 403) {
    code = 'AccessDenied';
    message = 'Valid and authorized credentials required';
  } else if (statusCode === 404) {
    code = 'NotFound';
    message = 'Not Found';
  } else if (statusCode === 405) {
    code = 'MethodNotAllowed';
    message = 'Method Not Allowed';
  } else if (statusCode === 501) {
    code = 'MethodNotAllowed';
    message = 'Method Not Allowed';
  } else {
    code = 'UnknownError';
    message = `${statusCode}`;
  }
  var headerInfo = {};
  // A value created by S3 compatible server that uniquely identifies
  // the request.
  headerInfo.amzRequestid = response.headersSent ? response.getHeader('x-amz-request-id') : null;
  // A special token that helps troubleshoot API replies and issues.
  headerInfo.amzId2 = response.headersSent ? response.getHeader('x-amz-id-2') : null;
  // Region where the bucket is located. This header is returned only
  // in HEAD bucket and ListObjects response.
  headerInfo.amzBucketRegion = response.headersSent ? response.getHeader('x-amz-bucket-region') : null;
  return getConcater(xmlString => {
    let getError = () => {
      // Message should be instantiated for each S3Errors.
      var e = new errors.S3Error(message);
      // S3 Error code.
      e.code = code;
      _.each(headerInfo, (value, key) => {
        e[key] = value;
      });
      return e;
    };
    if (!xmlString) {
      return getError();
    }
    let e;
    try {
      e = xmlParsers.parseError(xmlString, headerInfo);
    } catch (ex) {
      return getError();
    }
    return e;
  }, true);
}

// A through stream that calculates md5sum and sha256sum
export function getHashSummer(enableSHA256) {
  var md5 = Crypto.createHash('md5');
  var sha256 = Crypto.createHash('sha256');
  return Through2.obj(function (chunk, enc, cb) {
    if (enableSHA256) {
      sha256.update(chunk);
    } else {
      md5.update(chunk);
    }
    cb();
  }, function (cb) {
    var md5sum = '';
    var sha256sum = '';
    if (enableSHA256) {
      sha256sum = sha256.digest('hex');
    } else {
      md5sum = md5.digest('base64');
    }
    var hashData = {
      md5sum,
      sha256sum
    };
    this.push(hashData);
    this.push(null);
    cb();
  });
}

// Following functions return a stream object that parses XML
// and emits suitable Javascript objects.

// Parses CopyObject response.
export function getCopyObjectTransformer() {
  return getConcater(xmlParsers.parseCopyObject);
}

// Parses listBuckets response.
export function getListBucketTransformer() {
  return getConcater(xmlParsers.parseListBucket);
}

// Parses listMultipartUploads response.
export function getListMultipartTransformer() {
  return getConcater(xmlParsers.parseListMultipart);
}

// Parses listParts response.
export function getListPartsTransformer() {
  return getConcater(xmlParsers.parseListParts);
}

// Parses initMultipartUpload response.
export function getInitiateMultipartTransformer() {
  return getConcater(xmlParsers.parseInitiateMultipart);
}

// Parses listObjects response.
export function getListObjectsTransformer() {
  return getConcater(xmlParsers.parseListObjects);
}

// Parses listObjects response.
export function getListObjectsV2Transformer() {
  return getConcater(xmlParsers.parseListObjectsV2);
}

// Parses listObjects with metadata response.
export function getListObjectsV2WithMetadataTransformer() {
  return getConcater(xmlParsers.parseListObjectsV2WithMetadata);
}

// Parses completeMultipartUpload response.
export function getCompleteMultipartTransformer() {
  return getConcater(xmlParsers.parseCompleteMultipart);
}

// Parses getBucketLocation response.
export function getBucketRegionTransformer() {
  return getConcater(xmlParsers.parseBucketRegion);
}

// Parses GET/SET BucketNotification response
export function getBucketNotificationTransformer() {
  return getConcater(xmlParsers.parseBucketNotification);
}

// Parses a notification.
export function getNotificationTransformer() {
  // This will parse and return each object.
  return new JSONParser();
}
export function bucketVersioningTransformer() {
  return getConcater(xmlParsers.parseBucketVersioningConfig);
}
export function getTagsTransformer() {
  return getConcater(xmlParsers.parseTagging);
}
export function lifecycleTransformer() {
  return getConcater(xmlParsers.parseLifecycleConfig);
}
export function objectLockTransformer() {
  return getConcater(xmlParsers.parseObjectLockConfig);
}
export function objectRetentionTransformer() {
  return getConcater(xmlParsers.parseObjectRetentionConfig);
}
export function bucketEncryptionTransformer() {
  return getConcater(xmlParsers.parseBucketEncryptionConfig);
}
export function replicationConfigTransformer() {
  return getConcater(xmlParsers.parseReplicationConfig);
}
export function objectLegalHoldTransformer() {
  return getConcater(xmlParsers.parseObjectLegalHoldConfig);
}
export function uploadPartTransformer() {
  return getConcater(xmlParsers.uploadPartParser);
}
export function selectObjectContentTransformer() {
  return getConcater();
}
export function removeObjectsTransformer() {
  return getConcater(xmlParsers.removeObjectsParser);
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDcnlwdG8iLCJKU09OUGFyc2VyIiwiXyIsIlRocm91Z2gyIiwiZXJyb3JzIiwiaXNGdW5jdGlvbiIsInhtbFBhcnNlcnMiLCJnZXRDb25jYXRlciIsInBhcnNlciIsImVtaXRFcnJvciIsIm9iamVjdE1vZGUiLCJidWZzIiwiVHlwZUVycm9yIiwiY2h1bmsiLCJlbmMiLCJjYiIsInB1c2giLCJCdWZmZXIiLCJjb25jYXQiLCJ0b1N0cmluZyIsImxlbmd0aCIsImdldEVycm9yVHJhbnNmb3JtZXIiLCJyZXNwb25zZSIsInN0YXR1c0NvZGUiLCJjb2RlIiwibWVzc2FnZSIsImhlYWRlckluZm8iLCJhbXpSZXF1ZXN0aWQiLCJoZWFkZXJzU2VudCIsImdldEhlYWRlciIsImFteklkMiIsImFtekJ1Y2tldFJlZ2lvbiIsInhtbFN0cmluZyIsImdldEVycm9yIiwiZSIsIlMzRXJyb3IiLCJlYWNoIiwidmFsdWUiLCJrZXkiLCJwYXJzZUVycm9yIiwiZXgiLCJnZXRIYXNoU3VtbWVyIiwiZW5hYmxlU0hBMjU2IiwibWQ1IiwiY3JlYXRlSGFzaCIsInNoYTI1NiIsIm9iaiIsInVwZGF0ZSIsIm1kNXN1bSIsInNoYTI1NnN1bSIsImRpZ2VzdCIsImhhc2hEYXRhIiwiZ2V0Q29weU9iamVjdFRyYW5zZm9ybWVyIiwicGFyc2VDb3B5T2JqZWN0IiwiZ2V0TGlzdEJ1Y2tldFRyYW5zZm9ybWVyIiwicGFyc2VMaXN0QnVja2V0IiwiZ2V0TGlzdE11bHRpcGFydFRyYW5zZm9ybWVyIiwicGFyc2VMaXN0TXVsdGlwYXJ0IiwiZ2V0TGlzdFBhcnRzVHJhbnNmb3JtZXIiLCJwYXJzZUxpc3RQYXJ0cyIsImdldEluaXRpYXRlTXVsdGlwYXJ0VHJhbnNmb3JtZXIiLCJwYXJzZUluaXRpYXRlTXVsdGlwYXJ0IiwiZ2V0TGlzdE9iamVjdHNUcmFuc2Zvcm1lciIsInBhcnNlTGlzdE9iamVjdHMiLCJnZXRMaXN0T2JqZWN0c1YyVHJhbnNmb3JtZXIiLCJwYXJzZUxpc3RPYmplY3RzVjIiLCJnZXRMaXN0T2JqZWN0c1YyV2l0aE1ldGFkYXRhVHJhbnNmb3JtZXIiLCJwYXJzZUxpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGEiLCJnZXRDb21wbGV0ZU11bHRpcGFydFRyYW5zZm9ybWVyIiwicGFyc2VDb21wbGV0ZU11bHRpcGFydCIsImdldEJ1Y2tldFJlZ2lvblRyYW5zZm9ybWVyIiwicGFyc2VCdWNrZXRSZWdpb24iLCJnZXRCdWNrZXROb3RpZmljYXRpb25UcmFuc2Zvcm1lciIsInBhcnNlQnVja2V0Tm90aWZpY2F0aW9uIiwiZ2V0Tm90aWZpY2F0aW9uVHJhbnNmb3JtZXIiLCJidWNrZXRWZXJzaW9uaW5nVHJhbnNmb3JtZXIiLCJwYXJzZUJ1Y2tldFZlcnNpb25pbmdDb25maWciLCJnZXRUYWdzVHJhbnNmb3JtZXIiLCJwYXJzZVRhZ2dpbmciLCJsaWZlY3ljbGVUcmFuc2Zvcm1lciIsInBhcnNlTGlmZWN5Y2xlQ29uZmlnIiwib2JqZWN0TG9ja1RyYW5zZm9ybWVyIiwicGFyc2VPYmplY3RMb2NrQ29uZmlnIiwib2JqZWN0UmV0ZW50aW9uVHJhbnNmb3JtZXIiLCJwYXJzZU9iamVjdFJldGVudGlvbkNvbmZpZyIsImJ1Y2tldEVuY3J5cHRpb25UcmFuc2Zvcm1lciIsInBhcnNlQnVja2V0RW5jcnlwdGlvbkNvbmZpZyIsInJlcGxpY2F0aW9uQ29uZmlnVHJhbnNmb3JtZXIiLCJwYXJzZVJlcGxpY2F0aW9uQ29uZmlnIiwib2JqZWN0TGVnYWxIb2xkVHJhbnNmb3JtZXIiLCJwYXJzZU9iamVjdExlZ2FsSG9sZENvbmZpZyIsInVwbG9hZFBhcnRUcmFuc2Zvcm1lciIsInVwbG9hZFBhcnRQYXJzZXIiLCJzZWxlY3RPYmplY3RDb250ZW50VHJhbnNmb3JtZXIiLCJyZW1vdmVPYmplY3RzVHJhbnNmb3JtZXIiLCJyZW1vdmVPYmplY3RzUGFyc2VyIl0sInNvdXJjZXMiOlsidHJhbnNmb3JtZXJzLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBNaW5JTyBKYXZhc2NyaXB0IExpYnJhcnkgZm9yIEFtYXpvbiBTMyBDb21wYXRpYmxlIENsb3VkIFN0b3JhZ2UsIChDKSAyMDE1LCAyMDE2IE1pbklPLCBJbmMuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbmltcG9ydCAqIGFzIENyeXB0byBmcm9tICdub2RlOmNyeXB0bydcblxuaW1wb3J0IEpTT05QYXJzZXIgZnJvbSAnanNvbi1zdHJlYW0nXG5pbXBvcnQgXyBmcm9tICdsb2Rhc2gnXG5pbXBvcnQgVGhyb3VnaDIgZnJvbSAndGhyb3VnaDInXG5cbmltcG9ydCAqIGFzIGVycm9ycyBmcm9tICcuL2Vycm9ycy50cydcbmltcG9ydCB7IGlzRnVuY3Rpb24gfSBmcm9tICcuL2ludGVybmFsL2hlbHBlci50cydcbmltcG9ydCAqIGFzIHhtbFBhcnNlcnMgZnJvbSAnLi94bWwtcGFyc2Vycy5qcydcblxuLy8gZ2V0Q29uY2F0ZXIgcmV0dXJucyBhIHN0cmVhbSB0aGF0IGNvbmNhdGVuYXRlcyB0aGUgaW5wdXQgYW5kIGVtaXRzXG4vLyB0aGUgY29uY2F0ZW5hdGVkIG91dHB1dCB3aGVuICdlbmQnIGhhcyByZWFjaGVkLiBJZiBhbiBvcHRpb25hbFxuLy8gcGFyc2VyIGZ1bmN0aW9uIGlzIHBhc3NlZCB1cG9uIHJlYWNoaW5nIHRoZSAnZW5kJyBvZiB0aGUgc3RyZWFtLFxuLy8gYHBhcnNlcihjb25jYXRlbmF0ZWRfZGF0YSlgIHdpbGwgYmUgZW1pdHRlZC5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb25jYXRlcihwYXJzZXIsIGVtaXRFcnJvcikge1xuICB2YXIgb2JqZWN0TW9kZSA9IGZhbHNlXG4gIHZhciBidWZzID0gW11cblxuICBpZiAocGFyc2VyICYmICFpc0Z1bmN0aW9uKHBhcnNlcikpIHtcbiAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdwYXJzZXIgc2hvdWxkIGJlIG9mIHR5cGUgXCJmdW5jdGlvblwiJylcbiAgfVxuXG4gIGlmIChwYXJzZXIpIHtcbiAgICBvYmplY3RNb2RlID0gdHJ1ZVxuICB9XG5cbiAgcmV0dXJuIFRocm91Z2gyKFxuICAgIHsgb2JqZWN0TW9kZSB9LFxuICAgIGZ1bmN0aW9uIChjaHVuaywgZW5jLCBjYikge1xuICAgICAgYnVmcy5wdXNoKGNodW5rKVxuICAgICAgY2IoKVxuICAgIH0sXG4gICAgZnVuY3Rpb24gKGNiKSB7XG4gICAgICBpZiAoZW1pdEVycm9yKSB7XG4gICAgICAgIGNiKHBhcnNlcihCdWZmZXIuY29uY2F0KGJ1ZnMpLnRvU3RyaW5nKCkpKVxuICAgICAgICAvLyBjYihlKSB3b3VsZCBtZWFuIHdlIGhhdmUgdG8gZW1pdCAnZW5kJyBieSBleHBsaWNpdGx5IGNhbGxpbmcgdGhpcy5wdXNoKG51bGwpXG4gICAgICAgIHRoaXMucHVzaChudWxsKVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIGlmIChidWZzLmxlbmd0aCkge1xuICAgICAgICBpZiAocGFyc2VyKSB7XG4gICAgICAgICAgdGhpcy5wdXNoKHBhcnNlcihCdWZmZXIuY29uY2F0KGJ1ZnMpLnRvU3RyaW5nKCkpKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRoaXMucHVzaChCdWZmZXIuY29uY2F0KGJ1ZnMpKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBjYigpXG4gICAgfSxcbiAgKVxufVxuXG4vLyBHZW5lcmF0ZXMgYW4gRXJyb3Igb2JqZWN0IGRlcGVuZGluZyBvbiBodHRwIHN0YXR1c0NvZGUgYW5kIFhNTCBib2R5XG5leHBvcnQgZnVuY3Rpb24gZ2V0RXJyb3JUcmFuc2Zvcm1lcihyZXNwb25zZSkge1xuICB2YXIgc3RhdHVzQ29kZSA9IHJlc3BvbnNlLnN0YXR1c0NvZGVcbiAgdmFyIGNvZGUsIG1lc3NhZ2VcbiAgaWYgKHN0YXR1c0NvZGUgPT09IDMwMSkge1xuICAgIGNvZGUgPSAnTW92ZWRQZXJtYW5lbnRseSdcbiAgICBtZXNzYWdlID0gJ01vdmVkIFBlcm1hbmVudGx5J1xuICB9IGVsc2UgaWYgKHN0YXR1c0NvZGUgPT09IDMwNykge1xuICAgIGNvZGUgPSAnVGVtcG9yYXJ5UmVkaXJlY3QnXG4gICAgbWVzc2FnZSA9ICdBcmUgeW91IHVzaW5nIHRoZSBjb3JyZWN0IGVuZHBvaW50IFVSTD8nXG4gIH0gZWxzZSBpZiAoc3RhdHVzQ29kZSA9PT0gNDAzKSB7XG4gICAgY29kZSA9ICdBY2Nlc3NEZW5pZWQnXG4gICAgbWVzc2FnZSA9ICdWYWxpZCBhbmQgYXV0aG9yaXplZCBjcmVkZW50aWFscyByZXF1aXJlZCdcbiAgfSBlbHNlIGlmIChzdGF0dXNDb2RlID09PSA0MDQpIHtcbiAgICBjb2RlID0gJ05vdEZvdW5kJ1xuICAgIG1lc3NhZ2UgPSAnTm90IEZvdW5kJ1xuICB9IGVsc2UgaWYgKHN0YXR1c0NvZGUgPT09IDQwNSkge1xuICAgIGNvZGUgPSAnTWV0aG9kTm90QWxsb3dlZCdcbiAgICBtZXNzYWdlID0gJ01ldGhvZCBOb3QgQWxsb3dlZCdcbiAgfSBlbHNlIGlmIChzdGF0dXNDb2RlID09PSA1MDEpIHtcbiAgICBjb2RlID0gJ01ldGhvZE5vdEFsbG93ZWQnXG4gICAgbWVzc2FnZSA9ICdNZXRob2QgTm90IEFsbG93ZWQnXG4gIH0gZWxzZSB7XG4gICAgY29kZSA9ICdVbmtub3duRXJyb3InXG4gICAgbWVzc2FnZSA9IGAke3N0YXR1c0NvZGV9YFxuICB9XG5cbiAgdmFyIGhlYWRlckluZm8gPSB7fVxuICAvLyBBIHZhbHVlIGNyZWF0ZWQgYnkgUzMgY29tcGF0aWJsZSBzZXJ2ZXIgdGhhdCB1bmlxdWVseSBpZGVudGlmaWVzXG4gIC8vIHRoZSByZXF1ZXN0LlxuICBoZWFkZXJJbmZvLmFtelJlcXVlc3RpZCA9IHJlc3BvbnNlLmhlYWRlcnNTZW50ID8gcmVzcG9uc2UuZ2V0SGVhZGVyKCd4LWFtei1yZXF1ZXN0LWlkJykgOiBudWxsXG4gIC8vIEEgc3BlY2lhbCB0b2tlbiB0aGF0IGhlbHBzIHRyb3VibGVzaG9vdCBBUEkgcmVwbGllcyBhbmQgaXNzdWVzLlxuICBoZWFkZXJJbmZvLmFteklkMiA9IHJlc3BvbnNlLmhlYWRlcnNTZW50ID8gcmVzcG9uc2UuZ2V0SGVhZGVyKCd4LWFtei1pZC0yJykgOiBudWxsXG4gIC8vIFJlZ2lvbiB3aGVyZSB0aGUgYnVja2V0IGlzIGxvY2F0ZWQuIFRoaXMgaGVhZGVyIGlzIHJldHVybmVkIG9ubHlcbiAgLy8gaW4gSEVBRCBidWNrZXQgYW5kIExpc3RPYmplY3RzIHJlc3BvbnNlLlxuICBoZWFkZXJJbmZvLmFtekJ1Y2tldFJlZ2lvbiA9IHJlc3BvbnNlLmhlYWRlcnNTZW50ID8gcmVzcG9uc2UuZ2V0SGVhZGVyKCd4LWFtei1idWNrZXQtcmVnaW9uJykgOiBudWxsXG5cbiAgcmV0dXJuIGdldENvbmNhdGVyKCh4bWxTdHJpbmcpID0+IHtcbiAgICBsZXQgZ2V0RXJyb3IgPSAoKSA9PiB7XG4gICAgICAvLyBNZXNzYWdlIHNob3VsZCBiZSBpbnN0YW50aWF0ZWQgZm9yIGVhY2ggUzNFcnJvcnMuXG4gICAgICB2YXIgZSA9IG5ldyBlcnJvcnMuUzNFcnJvcihtZXNzYWdlKVxuICAgICAgLy8gUzMgRXJyb3IgY29kZS5cbiAgICAgIGUuY29kZSA9IGNvZGVcbiAgICAgIF8uZWFjaChoZWFkZXJJbmZvLCAodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICBlW2tleV0gPSB2YWx1ZVxuICAgICAgfSlcbiAgICAgIHJldHVybiBlXG4gICAgfVxuICAgIGlmICgheG1sU3RyaW5nKSB7XG4gICAgICByZXR1cm4gZ2V0RXJyb3IoKVxuICAgIH1cbiAgICBsZXQgZVxuICAgIHRyeSB7XG4gICAgICBlID0geG1sUGFyc2Vycy5wYXJzZUVycm9yKHhtbFN0cmluZywgaGVhZGVySW5mbylcbiAgICB9IGNhdGNoIChleCkge1xuICAgICAgcmV0dXJuIGdldEVycm9yKClcbiAgICB9XG4gICAgcmV0dXJuIGVcbiAgfSwgdHJ1ZSlcbn1cblxuLy8gQSB0aHJvdWdoIHN0cmVhbSB0aGF0IGNhbGN1bGF0ZXMgbWQ1c3VtIGFuZCBzaGEyNTZzdW1cbmV4cG9ydCBmdW5jdGlvbiBnZXRIYXNoU3VtbWVyKGVuYWJsZVNIQTI1Nikge1xuICB2YXIgbWQ1ID0gQ3J5cHRvLmNyZWF0ZUhhc2goJ21kNScpXG4gIHZhciBzaGEyNTYgPSBDcnlwdG8uY3JlYXRlSGFzaCgnc2hhMjU2JylcblxuICByZXR1cm4gVGhyb3VnaDIub2JqKFxuICAgIGZ1bmN0aW9uIChjaHVuaywgZW5jLCBjYikge1xuICAgICAgaWYgKGVuYWJsZVNIQTI1Nikge1xuICAgICAgICBzaGEyNTYudXBkYXRlKGNodW5rKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWQ1LnVwZGF0ZShjaHVuaylcbiAgICAgIH1cbiAgICAgIGNiKClcbiAgICB9LFxuICAgIGZ1bmN0aW9uIChjYikge1xuICAgICAgdmFyIG1kNXN1bSA9ICcnXG4gICAgICB2YXIgc2hhMjU2c3VtID0gJydcbiAgICAgIGlmIChlbmFibGVTSEEyNTYpIHtcbiAgICAgICAgc2hhMjU2c3VtID0gc2hhMjU2LmRpZ2VzdCgnaGV4JylcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1kNXN1bSA9IG1kNS5kaWdlc3QoJ2Jhc2U2NCcpXG4gICAgICB9XG4gICAgICB2YXIgaGFzaERhdGEgPSB7IG1kNXN1bSwgc2hhMjU2c3VtIH1cbiAgICAgIHRoaXMucHVzaChoYXNoRGF0YSlcbiAgICAgIHRoaXMucHVzaChudWxsKVxuICAgICAgY2IoKVxuICAgIH0sXG4gIClcbn1cblxuLy8gRm9sbG93aW5nIGZ1bmN0aW9ucyByZXR1cm4gYSBzdHJlYW0gb2JqZWN0IHRoYXQgcGFyc2VzIFhNTFxuLy8gYW5kIGVtaXRzIHN1aXRhYmxlIEphdmFzY3JpcHQgb2JqZWN0cy5cblxuLy8gUGFyc2VzIENvcHlPYmplY3QgcmVzcG9uc2UuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29weU9iamVjdFRyYW5zZm9ybWVyKCkge1xuICByZXR1cm4gZ2V0Q29uY2F0ZXIoeG1sUGFyc2Vycy5wYXJzZUNvcHlPYmplY3QpXG59XG5cbi8vIFBhcnNlcyBsaXN0QnVja2V0cyByZXNwb25zZS5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMaXN0QnVja2V0VHJhbnNmb3JtZXIoKSB7XG4gIHJldHVybiBnZXRDb25jYXRlcih4bWxQYXJzZXJzLnBhcnNlTGlzdEJ1Y2tldClcbn1cblxuLy8gUGFyc2VzIGxpc3RNdWx0aXBhcnRVcGxvYWRzIHJlc3BvbnNlLlxuZXhwb3J0IGZ1bmN0aW9uIGdldExpc3RNdWx0aXBhcnRUcmFuc2Zvcm1lcigpIHtcbiAgcmV0dXJuIGdldENvbmNhdGVyKHhtbFBhcnNlcnMucGFyc2VMaXN0TXVsdGlwYXJ0KVxufVxuXG4vLyBQYXJzZXMgbGlzdFBhcnRzIHJlc3BvbnNlLlxuZXhwb3J0IGZ1bmN0aW9uIGdldExpc3RQYXJ0c1RyYW5zZm9ybWVyKCkge1xuICByZXR1cm4gZ2V0Q29uY2F0ZXIoeG1sUGFyc2Vycy5wYXJzZUxpc3RQYXJ0cylcbn1cblxuLy8gUGFyc2VzIGluaXRNdWx0aXBhcnRVcGxvYWQgcmVzcG9uc2UuXG5leHBvcnQgZnVuY3Rpb24gZ2V0SW5pdGlhdGVNdWx0aXBhcnRUcmFuc2Zvcm1lcigpIHtcbiAgcmV0dXJuIGdldENvbmNhdGVyKHhtbFBhcnNlcnMucGFyc2VJbml0aWF0ZU11bHRpcGFydClcbn1cblxuLy8gUGFyc2VzIGxpc3RPYmplY3RzIHJlc3BvbnNlLlxuZXhwb3J0IGZ1bmN0aW9uIGdldExpc3RPYmplY3RzVHJhbnNmb3JtZXIoKSB7XG4gIHJldHVybiBnZXRDb25jYXRlcih4bWxQYXJzZXJzLnBhcnNlTGlzdE9iamVjdHMpXG59XG5cbi8vIFBhcnNlcyBsaXN0T2JqZWN0cyByZXNwb25zZS5cbmV4cG9ydCBmdW5jdGlvbiBnZXRMaXN0T2JqZWN0c1YyVHJhbnNmb3JtZXIoKSB7XG4gIHJldHVybiBnZXRDb25jYXRlcih4bWxQYXJzZXJzLnBhcnNlTGlzdE9iamVjdHNWMilcbn1cblxuLy8gUGFyc2VzIGxpc3RPYmplY3RzIHdpdGggbWV0YWRhdGEgcmVzcG9uc2UuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGlzdE9iamVjdHNWMldpdGhNZXRhZGF0YVRyYW5zZm9ybWVyKCkge1xuICByZXR1cm4gZ2V0Q29uY2F0ZXIoeG1sUGFyc2Vycy5wYXJzZUxpc3RPYmplY3RzVjJXaXRoTWV0YWRhdGEpXG59XG5cbi8vIFBhcnNlcyBjb21wbGV0ZU11bHRpcGFydFVwbG9hZCByZXNwb25zZS5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb21wbGV0ZU11bHRpcGFydFRyYW5zZm9ybWVyKCkge1xuICByZXR1cm4gZ2V0Q29uY2F0ZXIoeG1sUGFyc2Vycy5wYXJzZUNvbXBsZXRlTXVsdGlwYXJ0KVxufVxuXG4vLyBQYXJzZXMgZ2V0QnVja2V0TG9jYXRpb24gcmVzcG9uc2UuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QnVja2V0UmVnaW9uVHJhbnNmb3JtZXIoKSB7XG4gIHJldHVybiBnZXRDb25jYXRlcih4bWxQYXJzZXJzLnBhcnNlQnVja2V0UmVnaW9uKVxufVxuXG4vLyBQYXJzZXMgR0VUL1NFVCBCdWNrZXROb3RpZmljYXRpb24gcmVzcG9uc2VcbmV4cG9ydCBmdW5jdGlvbiBnZXRCdWNrZXROb3RpZmljYXRpb25UcmFuc2Zvcm1lcigpIHtcbiAgcmV0dXJuIGdldENvbmNhdGVyKHhtbFBhcnNlcnMucGFyc2VCdWNrZXROb3RpZmljYXRpb24pXG59XG5cbi8vIFBhcnNlcyBhIG5vdGlmaWNhdGlvbi5cbmV4cG9ydCBmdW5jdGlvbiBnZXROb3RpZmljYXRpb25UcmFuc2Zvcm1lcigpIHtcbiAgLy8gVGhpcyB3aWxsIHBhcnNlIGFuZCByZXR1cm4gZWFjaCBvYmplY3QuXG4gIHJldHVybiBuZXcgSlNPTlBhcnNlcigpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWNrZXRWZXJzaW9uaW5nVHJhbnNmb3JtZXIoKSB7XG4gIHJldHVybiBnZXRDb25jYXRlcih4bWxQYXJzZXJzLnBhcnNlQnVja2V0VmVyc2lvbmluZ0NvbmZpZylcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRhZ3NUcmFuc2Zvcm1lcigpIHtcbiAgcmV0dXJuIGdldENvbmNhdGVyKHhtbFBhcnNlcnMucGFyc2VUYWdnaW5nKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbGlmZWN5Y2xlVHJhbnNmb3JtZXIoKSB7XG4gIHJldHVybiBnZXRDb25jYXRlcih4bWxQYXJzZXJzLnBhcnNlTGlmZWN5Y2xlQ29uZmlnKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gb2JqZWN0TG9ja1RyYW5zZm9ybWVyKCkge1xuICByZXR1cm4gZ2V0Q29uY2F0ZXIoeG1sUGFyc2Vycy5wYXJzZU9iamVjdExvY2tDb25maWcpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBvYmplY3RSZXRlbnRpb25UcmFuc2Zvcm1lcigpIHtcbiAgcmV0dXJuIGdldENvbmNhdGVyKHhtbFBhcnNlcnMucGFyc2VPYmplY3RSZXRlbnRpb25Db25maWcpXG59XG5leHBvcnQgZnVuY3Rpb24gYnVja2V0RW5jcnlwdGlvblRyYW5zZm9ybWVyKCkge1xuICByZXR1cm4gZ2V0Q29uY2F0ZXIoeG1sUGFyc2Vycy5wYXJzZUJ1Y2tldEVuY3J5cHRpb25Db25maWcpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXBsaWNhdGlvbkNvbmZpZ1RyYW5zZm9ybWVyKCkge1xuICByZXR1cm4gZ2V0Q29uY2F0ZXIoeG1sUGFyc2Vycy5wYXJzZVJlcGxpY2F0aW9uQ29uZmlnKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gb2JqZWN0TGVnYWxIb2xkVHJhbnNmb3JtZXIoKSB7XG4gIHJldHVybiBnZXRDb25jYXRlcih4bWxQYXJzZXJzLnBhcnNlT2JqZWN0TGVnYWxIb2xkQ29uZmlnKVxufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBsb2FkUGFydFRyYW5zZm9ybWVyKCkge1xuICByZXR1cm4gZ2V0Q29uY2F0ZXIoeG1sUGFyc2Vycy51cGxvYWRQYXJ0UGFyc2VyKVxufVxuZXhwb3J0IGZ1bmN0aW9uIHNlbGVjdE9iamVjdENvbnRlbnRUcmFuc2Zvcm1lcigpIHtcbiAgcmV0dXJuIGdldENvbmNhdGVyKClcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZU9iamVjdHNUcmFuc2Zvcm1lcigpIHtcbiAgcmV0dXJuIGdldENvbmNhdGVyKHhtbFBhcnNlcnMucmVtb3ZlT2JqZWN0c1BhcnNlcilcbn1cbiJdLCJtYXBwaW5ncyI6IkFBQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLE9BQU8sS0FBS0EsTUFBTTtBQUVsQixPQUFPQyxVQUFVLE1BQU0sYUFBYTtBQUNwQyxPQUFPQyxDQUFDLE1BQU0sUUFBUTtBQUN0QixPQUFPQyxRQUFRLE1BQU0sVUFBVTtBQUUvQixPQUFPLEtBQUtDLE1BQU0sTUFBTSxjQUFhO0FBQ3JDLFNBQVNDLFVBQVUsUUFBUSx1QkFBc0I7QUFDakQsT0FBTyxLQUFLQyxVQUFVLE1BQU0sbUJBQWtCOztBQUU5QztBQUNBO0FBQ0E7QUFDQTtBQUNBLE9BQU8sU0FBU0MsV0FBV0Es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