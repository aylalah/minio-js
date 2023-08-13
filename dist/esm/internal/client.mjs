import * as http from "http";
import * as https from "https";
import _ from 'lodash';
import { CredentialProvider } from "../CredentialProvider.mjs";
import * as errors from "../errors.mjs";
import { isAmazonEndpoint, isBoolean, isDefined, isEmpty, isObject, isString, isValidEndpoint, isValidPort, isVirtualHostStyle, uriResourceEscape } from "./helper.mjs";
import { getS3Endpoint } from "./s3-endpoints.mjs";
// will be replaced by bundler.
const Package = {
  version: "7.1.1" || 'development'
};
const requestOptionProperties = ['agent', 'ca', 'cert', 'ciphers', 'clientCertEngine', 'crl', 'dhparam', 'ecdhCurve', 'family', 'honorCipherOrder', 'key', 'passphrase', 'pfx', 'rejectUnauthorized', 'secureOptions', 'secureProtocol', 'servername', 'sessionIdContext'];
export class TypedClient {
  partSize = 64 * 1024 * 1024;
  maximumPartSize = 5 * 1024 * 1024 * 1024;
  maxObjectSize = 5 * 1024 * 1024 * 1024 * 1024;
  constructor(params) {
    // @ts-expect-error deprecated property
    if (params.secure !== undefined) {
      throw new Error('"secure" option deprecated, "useSSL" should be used instead');
    }
    // Default values if not specified.
    if (params.useSSL === undefined) {
      params.useSSL = true;
    }
    if (!params.port) {
      params.port = 0;
    }
    // Validate input params.
    if (!isValidEndpoint(params.endPoint)) {
      throw new errors.InvalidEndpointError(`Invalid endPoint : ${params.endPoint}`);
    }
    if (!isValidPort(params.port)) {
      throw new errors.InvalidArgumentError(`Invalid port : ${params.port}`);
    }
    if (!isBoolean(params.useSSL)) {
      throw new errors.InvalidArgumentError(`Invalid useSSL flag type : ${params.useSSL}, expected to be of type "boolean"`);
    }

    // Validate region only if its set.
    if (params.region) {
      if (!isString(params.region)) {
        throw new errors.InvalidArgumentError(`Invalid region : ${params.region}`);
      }
    }
    const host = params.endPoint.toLowerCase();
    let port = params.port;
    let protocol;
    let transport;
    let transportAgent;
    // Validate if configuration is not using SSL
    // for constructing relevant endpoints.
    if (params.useSSL) {
      // Defaults to secure.
      transport = https;
      protocol = 'https:';
      port = port || 443;
      transportAgent = https.globalAgent;
    } else {
      transport = http;
      protocol = 'http:';
      port = port || 80;
      transportAgent = http.globalAgent;
    }

    // if custom transport is set, use it.
    if (params.transport) {
      if (!isObject(params.transport)) {
        throw new errors.InvalidArgumentError(`Invalid transport type : ${params.transport}, expected to be type "object"`);
      }
      transport = params.transport;
    }

    // if custom transport agent is set, use it.
    if (params.transportAgent) {
      if (!isObject(params.transportAgent)) {
        throw new errors.InvalidArgumentError(`Invalid transportAgent type: ${params.transportAgent}, expected to be type "object"`);
      }
      transportAgent = params.transportAgent;
    }

    // User Agent should always following the below style.
    // Please open an issue to discuss any new changes here.
    //
    //       MinIO (OS; ARCH) LIB/VER APP/VER
    //
    const libraryComments = `(${process.platform}; ${process.arch})`;
    const libraryAgent = `MinIO ${libraryComments} minio-js/${Package.version}`;
    // User agent block ends.

    this.transport = transport;
    this.transportAgent = transportAgent;
    this.host = host;
    this.port = port;
    this.protocol = protocol;
    this.userAgent = `${libraryAgent}`;

    // Default path style is true
    if (params.pathStyle === undefined) {
      this.pathStyle = true;
    } else {
      this.pathStyle = params.pathStyle;
    }
    this.accessKey = params.accessKey ?? '';
    this.secretKey = params.secretKey ?? '';
    this.sessionToken = params.sessionToken;
    this.anonymous = !this.accessKey || !this.secretKey;
    if (params.credentialsProvider) {
      this.credentialsProvider = params.credentialsProvider;
    }
    this.regionMap = {};
    if (params.region) {
      this.region = params.region;
    }
    if (params.partSize) {
      this.partSize = params.partSize;
      this.overRidePartSize = true;
    }
    if (this.partSize < 5 * 1024 * 1024) {
      throw new errors.InvalidArgumentError(`Part size should be greater than 5MB`);
    }
    if (this.partSize > 5 * 1024 * 1024 * 1024) {
      throw new errors.InvalidArgumentError(`Part size should be less than 5GB`);
    }

    // SHA256 is enabled only for authenticated http requests. If the request is authenticated
    // and the connection is https we use x-amz-content-sha256=UNSIGNED-PAYLOAD
    // header for signature calculation.
    this.enableSHA256 = !this.anonymous && !params.useSSL;
    this.s3AccelerateEndpoint = params.s3AccelerateEndpoint || undefined;
    this.reqOptions = {};
  }

  /**
   * @param endPoint - valid S3 acceleration end point
   */
  setS3TransferAccelerate(endPoint) {
    this.s3AccelerateEndpoint = endPoint;
  }

  /**
   * Sets the supported request options.
   */
  setRequestOptions(options) {
    if (!isObject(options)) {
      throw new TypeError('request options should be of type "object"');
    }
    this.reqOptions = _.pick(options, requestOptionProperties);
  }

  /**
   *  This is s3 Specific and does not hold validity in any other Object storage.
   */
  getAccelerateEndPointIfSet(bucketName, objectName) {
    if (!isEmpty(this.s3AccelerateEndpoint) && !isEmpty(bucketName) && !isEmpty(objectName)) {
      // http://docs.aws.amazon.com/AmazonS3/latest/dev/transfer-acceleration.html
      // Disable transfer acceleration for non-compliant bucket names.
      if (bucketName.includes('.')) {
        throw new Error(`Transfer Acceleration is not supported for non compliant bucket:${bucketName}`);
      }
      // If transfer acceleration is requested set new host.
      // For more details about enabling transfer acceleration read here.
      // http://docs.aws.amazon.com/AmazonS3/latest/dev/transfer-acceleration.html
      return this.s3AccelerateEndpoint;
    }
    return false;
  }

  /**
   * returns options object that can be used with http.request()
   * Takes care of constructing virtual-host-style or path-style hostname
   */
  getRequestOptions(opts) {
    const method = opts.method;
    const region = opts.region;
    const bucketName = opts.bucketName;
    let objectName = opts.objectName;
    const headers = opts.headers;
    const query = opts.query;
    let reqOptions = {
      method,
      headers: {},
      protocol: this.protocol,
      // If custom transportAgent was supplied earlier, we'll inject it here
      agent: this.transportAgent
    };

    // Verify if virtual host supported.
    let virtualHostStyle;
    if (bucketName) {
      virtualHostStyle = isVirtualHostStyle(this.host, this.protocol, bucketName, this.pathStyle);
    }
    let path = '/';
    let host = this.host;
    let port;
    if (this.port) {
      port = this.port;
    }
    if (objectName) {
      objectName = uriResourceEscape(objectName);
    }

    // For Amazon S3 endpoint, get endpoint based on region.
    if (isAmazonEndpoint(host)) {
      const accelerateEndPoint = this.getAccelerateEndPointIfSet(bucketName, objectName);
      if (accelerateEndPoint) {
        host = `${accelerateEndPoint}`;
      } else {
        host = getS3Endpoint(region);
      }
    }
    if (virtualHostStyle && !opts.pathStyle) {
      // For all hosts which support virtual host style, `bucketName`
      // is part of the hostname in the following format:
      //
      //  var host = 'bucketName.example.com'
      //
      if (bucketName) {
        host = `${bucketName}.${host}`;
      }
      if (objectName) {
        path = `/${objectName}`;
      }
    } else {
      // For all S3 compatible storage services we will fallback to
      // path style requests, where `bucketName` is part of the URI
      // path.
      if (bucketName) {
        path = `/${bucketName}`;
      }
      if (objectName) {
        path = `/${bucketName}/${objectName}`;
      }
    }
    if (query) {
      path += `?${query}`;
    }
    reqOptions.headers.host = host;
    if (reqOptions.protocol === 'http:' && port !== 80 || reqOptions.protocol === 'https:' && port !== 443) {
      reqOptions.headers.host = `${host}:${port}`;
    }
    reqOptions.headers['user-agent'] = this.userAgent;
    if (headers) {
      // have all header keys in lower case - to make signing easy
      for (const [k, v] of Object.entries(headers)) {
        reqOptions.headers[k.toLowerCase()] = v;
      }
    }

    // Use any request option specified in minioClient.setRequestOptions()
    reqOptions = Object.assign({}, this.reqOptions, reqOptions);
    return {
      ...reqOptions,
      headers: _.mapValues(_.pickBy(reqOptions.headers, isDefined), v => v.toString()),
      host,
      port,
      path
    };
  }
  async setCredentialsProvider(credentialsProvider) {
    if (!(credentialsProvider instanceof CredentialProvider)) {
      throw new Error('Unable to get credentials. Expected instance of CredentialProvider');
    }
    this.credentialsProvider = credentialsProvider;
    await this.checkAndRefreshCreds();
  }
  async checkAndRefreshCreds() {
    if (this.credentialsProvider) {
      try {
        const credentialsConf = await this.credentialsProvider.getCredentials();
        this.accessKey = credentialsConf.getAccessKey();
        this.secretKey = credentialsConf.getSecretKey();
        this.sessionToken = credentialsConf.getSessionToken();
      } catch (e) {
        throw new Error(`Unable to get credentials: ${e}`, {
          cause: e
        });
      }
    }
  }
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJodHRwIiwiaHR0cHMiLCJfIiwiQ3JlZGVudGlhbFByb3ZpZGVyIiwiZXJyb3JzIiwiaXNBbWF6b25FbmRwb2ludCIsImlzQm9vbGVhbiIsImlzRGVmaW5lZCIsImlzRW1wdHkiLCJpc09iamVjdCIsImlzU3RyaW5nIiwiaXNWYWxpZEVuZHBvaW50IiwiaXNWYWxpZFBvcnQiLCJpc1ZpcnR1YWxIb3N0U3R5bGUiLCJ1cmlSZXNvdXJjZUVzY2FwZSIsImdldFMzRW5kcG9pbnQiLCJQYWNrYWdlIiwidmVyc2lvbiIsInJlcXVlc3RPcHRpb25Qcm9wZXJ0aWVzIiwiVHlwZWRDbGllbnQiLCJwYXJ0U2l6ZSIsIm1heGltdW1QYXJ0U2l6ZSIsIm1heE9iamVjdFNpemUiLCJjb25zdHJ1Y3RvciIsInBhcmFtcyIsInNlY3VyZSIsInVuZGVmaW5lZCIsIkVycm9yIiwidXNlU1NMIiwicG9ydCIsImVuZFBvaW50IiwiSW52YWxpZEVuZHBvaW50RXJyb3IiLCJJbnZhbGlkQXJndW1lbnRFcnJvciIsInJlZ2lvbiIsImhvc3QiLCJ0b0xvd2VyQ2FzZSIsInByb3RvY29sIiwidHJhbnNwb3J0IiwidHJhbnNwb3J0QWdlbnQiLCJnbG9iYWxBZ2VudCIsImxpYnJhcnlDb21tZW50cyIsInByb2Nlc3MiLCJwbGF0Zm9ybSIsImFyY2giLCJsaWJyYXJ5QWdlbnQiLCJ1c2VyQWdlbnQiLCJwYXRoU3R5bGUiLCJhY2Nlc3NLZXkiLCJzZWNyZXRLZXkiLCJzZXNzaW9uVG9rZW4iLCJhbm9ueW1vdXMiLCJjcmVkZW50aWFsc1Byb3ZpZGVyIiwicmVnaW9uTWFwIiwib3ZlclJpZGVQYXJ0U2l6ZSIsImVuYWJsZVNIQTI1NiIsInMzQWNjZWxlcmF0ZUVuZHBvaW50IiwicmVxT3B0aW9ucyIsInNldFMzVHJhbnNmZXJBY2NlbGVyYXRlIiwic2V0UmVxdWVzdE9wdGlvbnMiLCJvcHRpb25zIiwiVHlwZUVycm9yIiwicGljayIsImdldEFjY2VsZXJhdGVFbmRQb2ludElmU2V0IiwiYnVja2V0TmFtZSIsIm9iamVjdE5hbWUiLCJpbmNsdWRlcyIsImdldFJlcXVlc3RPcHRpb25zIiwib3B0cyIsIm1ldGhvZCIsImhlYWRlcnMiLCJxdWVyeSIsImFnZW50IiwidmlydHVhbEhvc3RTdHlsZSIsInBhdGgiLCJhY2NlbGVyYXRlRW5kUG9pbnQiLCJrIiwidiIsIk9iamVjdCIsImVudHJpZXMiLCJhc3NpZ24iLCJtYXBWYWx1ZXMiLCJwaWNrQnkiLCJ0b1N0cmluZyIsInNldENyZWRlbnRpYWxzUHJvdmlkZXIiLCJjaGVja0FuZFJlZnJlc2hDcmVkcyIsImNyZWRlbnRpYWxzQ29uZiIsImdldENyZWRlbnRpYWxzIiwiZ2V0QWNjZXNzS2V5IiwiZ2V0U2VjcmV0S2V5IiwiZ2V0U2Vzc2lvblRva2VuIiwiZSIsImNhdXNlIl0sInNvdXJjZXMiOlsiY2xpZW50LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGh0dHAgZnJvbSAnbm9kZTpodHRwJ1xuaW1wb3J0ICogYXMgaHR0cHMgZnJvbSAnbm9kZTpodHRwcydcblxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJ1xuXG5pbXBvcnQgeyBDcmVkZW50aWFsUHJvdmlkZXIgfSBmcm9tICcuLi9DcmVkZW50aWFsUHJvdmlkZXIudHMnXG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi4vZXJyb3JzLnRzJ1xuaW1wb3J0IHtcbiAgaXNBbWF6b25FbmRwb2ludCxcbiAgaXNCb29sZWFuLFxuICBpc0RlZmluZWQsXG4gIGlzRW1wdHksXG4gIGlzT2JqZWN0LFxuICBpc1N0cmluZyxcbiAgaXNWYWxpZEVuZHBvaW50LFxuICBpc1ZhbGlkUG9ydCxcbiAgaXNWaXJ0dWFsSG9zdFN0eWxlLFxuICB1cmlSZXNvdXJjZUVzY2FwZSxcbn0gZnJvbSAnLi9oZWxwZXIudHMnXG5pbXBvcnQgdHlwZSB7IFJlZ2lvbiB9IGZyb20gJy4vczMtZW5kcG9pbnRzLnRzJ1xuaW1wb3J0IHsgZ2V0UzNFbmRwb2ludCB9IGZyb20gJy4vczMtZW5kcG9pbnRzLnRzJ1xuaW1wb3J0IHR5cGUgeyBJUmVxdWVzdCwgUmVxdWVzdEhlYWRlcnMsIFRyYW5zcG9ydCB9IGZyb20gJy4vdHlwZS50cydcblxuLy8gd2lsbCBiZSByZXBsYWNlZCBieSBidW5kbGVyLlxuY29uc3QgUGFja2FnZSA9IHsgdmVyc2lvbjogcHJvY2Vzcy5lbnYuTUlOSU9fSlNfUEFDS0FHRV9WRVJTSU9OIHx8ICdkZXZlbG9wbWVudCcgfVxuXG5jb25zdCByZXF1ZXN0T3B0aW9uUHJvcGVydGllcyA9IFtcbiAgJ2FnZW50JyxcbiAgJ2NhJyxcbiAgJ2NlcnQnLFxuICAnY2lwaGVycycsXG4gICdjbGllbnRDZXJ0RW5naW5lJyxcbiAgJ2NybCcsXG4gICdkaHBhcmFtJyxcbiAgJ2VjZGhDdXJ2ZScsXG4gICdmYW1pbHknLFxuICAnaG9ub3JDaXBoZXJPcmRlcicsXG4gICdrZXknLFxuICAncGFzc3BocmFzZScsXG4gICdwZngnLFxuICAncmVqZWN0VW5hdXRob3JpemVkJyxcbiAgJ3NlY3VyZU9wdGlvbnMnLFxuICAnc2VjdXJlUHJvdG9jb2wnLFxuICAnc2VydmVybmFtZScsXG4gICdzZXNzaW9uSWRDb250ZXh0Jyxcbl0gYXMgY29uc3RcblxuZXhwb3J0IGludGVyZmFjZSBDbGllbnRPcHRpb25zIHtcbiAgZW5kUG9pbnQ6IHN0cmluZ1xuICBhY2Nlc3NLZXk6IHN0cmluZ1xuICBzZWNyZXRLZXk6IHN0cmluZ1xuICB1c2VTU0w/OiBib29sZWFuXG4gIHBvcnQ/OiBudW1iZXJcbiAgcmVnaW9uPzogUmVnaW9uXG4gIHRyYW5zcG9ydD86IFRyYW5zcG9ydFxuICBzZXNzaW9uVG9rZW4/OiBzdHJpbmdcbiAgcGFydFNpemU/OiBudW1iZXJcbiAgcGF0aFN0eWxlPzogYm9vbGVhblxuICBjcmVkZW50aWFsc1Byb3ZpZGVyPzogQ3JlZGVudGlhbFByb3ZpZGVyXG4gIHMzQWNjZWxlcmF0ZUVuZHBvaW50Pzogc3RyaW5nXG4gIHRyYW5zcG9ydEFnZW50PzogaHR0cC5BZ2VudFxufVxuXG5leHBvcnQgdHlwZSBSZXF1ZXN0T3B0aW9uID0gUGFydGlhbDxJUmVxdWVzdD4gJiB7XG4gIG1ldGhvZDogc3RyaW5nXG4gIGJ1Y2tldE5hbWU/OiBzdHJpbmdcbiAgb2JqZWN0TmFtZT86IHN0cmluZ1xuICByZWdpb24/OiBzdHJpbmdcbiAgcXVlcnk/OiBzdHJpbmdcbiAgcGF0aFN0eWxlPzogYm9vbGVhblxufVxuXG5leHBvcnQgY2xhc3MgVHlwZWRDbGllbnQge1xuICBwcm90ZWN0ZWQgdHJhbnNwb3J0OiBUcmFuc3BvcnRcbiAgcHJvdGVjdGVkIGhvc3Q6IHN0cmluZ1xuICBwcm90ZWN0ZWQgcG9ydDogbnVtYmVyXG4gIHByb3RlY3RlZCBwcm90b2NvbDogc3RyaW5nXG4gIHByb3RlY3RlZCBhY2Nlc3NLZXk6IHN0cmluZ1xuICBwcm90ZWN0ZWQgc2VjcmV0S2V5OiBzdHJpbmdcbiAgcHJvdGVjdGVkIHNlc3Npb25Ub2tlbj86IHN0cmluZ1xuICBwcm90ZWN0ZWQgdXNlckFnZW50OiBzdHJpbmdcbiAgcHJvdGVjdGVkIGFub255bW91czogYm9vbGVhblxuICBwcm90ZWN0ZWQgcGF0aFN0eWxlOiBib29sZWFuXG4gIHByb3RlY3RlZCByZWdpb25NYXA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5cbiAgcHVibGljIHJlZ2lvbj86IHN0cmluZ1xuICBwcm90ZWN0ZWQgY3JlZGVudGlhbHNQcm92aWRlcj86IENyZWRlbnRpYWxQcm92aWRlclxuICBwYXJ0U2l6ZTogbnVtYmVyID0gNjQgKiAxMDI0ICogMTAyNFxuICBwcm90ZWN0ZWQgb3ZlclJpZGVQYXJ0U2l6ZT86IGJvb2xlYW5cblxuICBwcm90ZWN0ZWQgbWF4aW11bVBhcnRTaXplID0gNSAqIDEwMjQgKiAxMDI0ICogMTAyNFxuICBwcm90ZWN0ZWQgbWF4T2JqZWN0U2l6ZSA9IDUgKiAxMDI0ICogMTAyNCAqIDEwMjQgKiAxMDI0XG4gIHB1YmxpYyBlbmFibGVTSEEyNTY6IGJvb2xlYW5cbiAgcHJvdGVjdGVkIHMzQWNjZWxlcmF0ZUVuZHBvaW50Pzogc3RyaW5nXG4gIHByb3RlY3RlZCByZXFPcHRpb25zOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPlxuXG4gIHByb3RlY3RlZCB0cmFuc3BvcnRBZ2VudDogaHR0cC5BZ2VudFxuXG4gIGNvbnN0cnVjdG9yKHBhcmFtczogQ2xpZW50T3B0aW9ucykge1xuICAgIC8vIEB0cy1leHBlY3QtZXJyb3IgZGVwcmVjYXRlZCBwcm9wZXJ0eVxuICAgIGlmIChwYXJhbXMuc2VjdXJlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignXCJzZWN1cmVcIiBvcHRpb24gZGVwcmVjYXRlZCwgXCJ1c2VTU0xcIiBzaG91bGQgYmUgdXNlZCBpbnN0ZWFkJylcbiAgICB9XG4gICAgLy8gRGVmYXVsdCB2YWx1ZXMgaWYgbm90IHNwZWNpZmllZC5cbiAgICBpZiAocGFyYW1zLnVzZVNTTCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYXJhbXMudXNlU1NMID0gdHJ1ZVxuICAgIH1cbiAgICBpZiAoIXBhcmFtcy5wb3J0KSB7XG4gICAgICBwYXJhbXMucG9ydCA9IDBcbiAgICB9XG4gICAgLy8gVmFsaWRhdGUgaW5wdXQgcGFyYW1zLlxuICAgIGlmICghaXNWYWxpZEVuZHBvaW50KHBhcmFtcy5lbmRQb2ludCkpIHtcbiAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEVuZHBvaW50RXJyb3IoYEludmFsaWQgZW5kUG9pbnQgOiAke3BhcmFtcy5lbmRQb2ludH1gKVxuICAgIH1cbiAgICBpZiAoIWlzVmFsaWRQb3J0KHBhcmFtcy5wb3J0KSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcihgSW52YWxpZCBwb3J0IDogJHtwYXJhbXMucG9ydH1gKVxuICAgIH1cbiAgICBpZiAoIWlzQm9vbGVhbihwYXJhbXMudXNlU1NMKSkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcihcbiAgICAgICAgYEludmFsaWQgdXNlU1NMIGZsYWcgdHlwZSA6ICR7cGFyYW1zLnVzZVNTTH0sIGV4cGVjdGVkIHRvIGJlIG9mIHR5cGUgXCJib29sZWFuXCJgLFxuICAgICAgKVxuICAgIH1cblxuICAgIC8vIFZhbGlkYXRlIHJlZ2lvbiBvbmx5IGlmIGl0cyBzZXQuXG4gICAgaWYgKHBhcmFtcy5yZWdpb24pIHtcbiAgICAgIGlmICghaXNTdHJpbmcocGFyYW1zLnJlZ2lvbikpIHtcbiAgICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcihgSW52YWxpZCByZWdpb24gOiAke3BhcmFtcy5yZWdpb259YClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBob3N0ID0gcGFyYW1zLmVuZFBvaW50LnRvTG93ZXJDYXNlKClcbiAgICBsZXQgcG9ydCA9IHBhcmFtcy5wb3J0XG4gICAgbGV0IHByb3RvY29sOiBzdHJpbmdcbiAgICBsZXQgdHJhbnNwb3J0XG4gICAgbGV0IHRyYW5zcG9ydEFnZW50OiBodHRwLkFnZW50XG4gICAgLy8gVmFsaWRhdGUgaWYgY29uZmlndXJhdGlvbiBpcyBub3QgdXNpbmcgU1NMXG4gICAgLy8gZm9yIGNvbnN0cnVjdGluZyByZWxldmFudCBlbmRwb2ludHMuXG4gICAgaWYgKHBhcmFtcy51c2VTU0wpIHtcbiAgICAgIC8vIERlZmF1bHRzIHRvIHNlY3VyZS5cbiAgICAgIHRyYW5zcG9ydCA9IGh0dHBzXG4gICAgICBwcm90b2NvbCA9ICdodHRwczonXG4gICAgICBwb3J0ID0gcG9ydCB8fCA0NDNcbiAgICAgIHRyYW5zcG9ydEFnZW50ID0gaHR0cHMuZ2xvYmFsQWdlbnRcbiAgICB9IGVsc2Uge1xuICAgICAgdHJhbnNwb3J0ID0gaHR0cFxuICAgICAgcHJvdG9jb2wgPSAnaHR0cDonXG4gICAgICBwb3J0ID0gcG9ydCB8fCA4MFxuICAgICAgdHJhbnNwb3J0QWdlbnQgPSBodHRwLmdsb2JhbEFnZW50XG4gICAgfVxuXG4gICAgLy8gaWYgY3VzdG9tIHRyYW5zcG9ydCBpcyBzZXQsIHVzZSBpdC5cbiAgICBpZiAocGFyYW1zLnRyYW5zcG9ydCkge1xuICAgICAgaWYgKCFpc09iamVjdChwYXJhbXMudHJhbnNwb3J0KSkge1xuICAgICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKFxuICAgICAgICAgIGBJbnZhbGlkIHRyYW5zcG9ydCB0eXBlIDogJHtwYXJhbXMudHJhbnNwb3J0fSwgZXhwZWN0ZWQgdG8gYmUgdHlwZSBcIm9iamVjdFwiYCxcbiAgICAgICAgKVxuICAgICAgfVxuICAgICAgdHJhbnNwb3J0ID0gcGFyYW1zLnRyYW5zcG9ydFxuICAgIH1cblxuICAgIC8vIGlmIGN1c3RvbSB0cmFuc3BvcnQgYWdlbnQgaXMgc2V0LCB1c2UgaXQuXG4gICAgaWYgKHBhcmFtcy50cmFuc3BvcnRBZ2VudCkge1xuICAgICAgaWYgKCFpc09iamVjdChwYXJhbXMudHJhbnNwb3J0QWdlbnQpKSB7XG4gICAgICAgIHRocm93IG5ldyBlcnJvcnMuSW52YWxpZEFyZ3VtZW50RXJyb3IoXG4gICAgICAgICAgYEludmFsaWQgdHJhbnNwb3J0QWdlbnQgdHlwZTogJHtwYXJhbXMudHJhbnNwb3J0QWdlbnR9LCBleHBlY3RlZCB0byBiZSB0eXBlIFwib2JqZWN0XCJgLFxuICAgICAgICApXG4gICAgICB9XG5cbiAgICAgIHRyYW5zcG9ydEFnZW50ID0gcGFyYW1zLnRyYW5zcG9ydEFnZW50XG4gICAgfVxuXG4gICAgLy8gVXNlciBBZ2VudCBzaG91bGQgYWx3YXlzIGZvbGxvd2luZyB0aGUgYmVsb3cgc3R5bGUuXG4gICAgLy8gUGxlYXNlIG9wZW4gYW4gaXNzdWUgdG8gZGlzY3VzcyBhbnkgbmV3IGNoYW5nZXMgaGVyZS5cbiAgICAvL1xuICAgIC8vICAgICAgIE1pbklPIChPUzsgQVJDSCkgTElCL1ZFUiBBUFAvVkVSXG4gICAgLy9cbiAgICBjb25zdCBsaWJyYXJ5Q29tbWVudHMgPSBgKCR7cHJvY2Vzcy5wbGF0Zm9ybX07ICR7cHJvY2Vzcy5hcmNofSlgXG4gICAgY29uc3QgbGlicmFyeUFnZW50ID0gYE1pbklPICR7bGlicmFyeUNvbW1lbnRzfSBtaW5pby1qcy8ke1BhY2thZ2UudmVyc2lvbn1gXG4gICAgLy8gVXNlciBhZ2VudCBibG9jayBlbmRzLlxuXG4gICAgdGhpcy50cmFuc3BvcnQgPSB0cmFuc3BvcnRcbiAgICB0aGlzLnRyYW5zcG9ydEFnZW50ID0gdHJhbnNwb3J0QWdlbnRcbiAgICB0aGlzLmhvc3QgPSBob3N0XG4gICAgdGhpcy5wb3J0ID0gcG9ydFxuICAgIHRoaXMucHJvdG9jb2wgPSBwcm90b2NvbFxuICAgIHRoaXMudXNlckFnZW50ID0gYCR7bGlicmFyeUFnZW50fWBcblxuICAgIC8vIERlZmF1bHQgcGF0aCBzdHlsZSBpcyB0cnVlXG4gICAgaWYgKHBhcmFtcy5wYXRoU3R5bGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhpcy5wYXRoU3R5bGUgPSB0cnVlXG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucGF0aFN0eWxlID0gcGFyYW1zLnBhdGhTdHlsZVxuICAgIH1cblxuICAgIHRoaXMuYWNjZXNzS2V5ID0gcGFyYW1zLmFjY2Vzc0tleSA/PyAnJ1xuICAgIHRoaXMuc2VjcmV0S2V5ID0gcGFyYW1zLnNlY3JldEtleSA/PyAnJ1xuICAgIHRoaXMuc2Vzc2lvblRva2VuID0gcGFyYW1zLnNlc3Npb25Ub2tlblxuICAgIHRoaXMuYW5vbnltb3VzID0gIXRoaXMuYWNjZXNzS2V5IHx8ICF0aGlzLnNlY3JldEtleVxuXG4gICAgaWYgKHBhcmFtcy5jcmVkZW50aWFsc1Byb3ZpZGVyKSB7XG4gICAgICB0aGlzLmNyZWRlbnRpYWxzUHJvdmlkZXIgPSBwYXJhbXMuY3JlZGVudGlhbHNQcm92aWRlclxuICAgIH1cblxuICAgIHRoaXMucmVnaW9uTWFwID0ge31cbiAgICBpZiAocGFyYW1zLnJlZ2lvbikge1xuICAgICAgdGhpcy5yZWdpb24gPSBwYXJhbXMucmVnaW9uXG4gICAgfVxuXG4gICAgaWYgKHBhcmFtcy5wYXJ0U2l6ZSkge1xuICAgICAgdGhpcy5wYXJ0U2l6ZSA9IHBhcmFtcy5wYXJ0U2l6ZVxuICAgICAgdGhpcy5vdmVyUmlkZVBhcnRTaXplID0gdHJ1ZVxuICAgIH1cbiAgICBpZiAodGhpcy5wYXJ0U2l6ZSA8IDUgKiAxMDI0ICogMTAyNCkge1xuICAgICAgdGhyb3cgbmV3IGVycm9ycy5JbnZhbGlkQXJndW1lbnRFcnJvcihgUGFydCBzaXplIHNob3VsZCBiZSBncmVhdGVyIHRoYW4gNU1CYClcbiAgICB9XG4gICAgaWYgKHRoaXMucGFydFNpemUgPiA1ICogMTAyNCAqIDEwMjQgKiAxMDI0KSB7XG4gICAgICB0aHJvdyBuZXcgZXJyb3JzLkludmFsaWRBcmd1bWVudEVycm9yKGBQYXJ0IHNpemUgc2hvdWxkIGJlIGxlc3MgdGhhbiA1R0JgKVxuICAgIH1cblxuICAgIC8vIFNIQTI1NiBpcyBlbmFibGVkIG9ubHkgZm9yIGF1dGhlbnRpY2F0ZWQgaHR0cCByZXF1ZXN0cy4gSWYgdGhlIHJlcXVlc3QgaXMgYXV0aGVudGljYXRlZFxuICAgIC8vIGFuZCB0aGUgY29ubmVjdGlvbiBpcyBodHRwcyB3ZSB1c2UgeC1hbXotY29udGVudC1zaGEyNTY9VU5TSUdORUQtUEFZTE9BRFxuICAgIC8vIGhlYWRlciBmb3Igc2lnbmF0dXJlIGNhbGN1bGF0aW9uLlxuICAgIHRoaXMuZW5hYmxlU0hBMjU2ID0gIXRoaXMuYW5vbnltb3VzICYmICFwYXJhbXMudXNlU1NMXG5cbiAgICB0aGlzLnMzQWNjZWxlcmF0ZUVuZHBvaW50ID0gcGFyYW1zLnMzQWNjZWxlcmF0ZUVuZHBvaW50IHx8IHVuZGVmaW5lZFxuICAgIHRoaXMucmVxT3B0aW9ucyA9IHt9XG4gIH1cblxuICAvKipcbiAgICogQHBhcmFtIGVuZFBvaW50IC0gdmFsaWQgUzMgYWNjZWxlcmF0aW9uIGVuZCBwb2ludFxuICAgKi9cbiAgc2V0UzNUcmFuc2ZlckFjY2VsZXJhdGUoZW5kUG9pbnQ6IHN0cmluZykge1xuICAgIHRoaXMuczNBY2NlbGVyYXRlRW5kcG9pbnQgPSBlbmRQb2ludFxuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIHN1cHBvcnRlZCByZXF1ZXN0IG9wdGlvbnMuXG4gICAqL1xuICBwdWJsaWMgc2V0UmVxdWVzdE9wdGlvbnMob3B0aW9uczogUGljazxodHRwcy5SZXF1ZXN0T3B0aW9ucywgKHR5cGVvZiByZXF1ZXN0T3B0aW9uUHJvcGVydGllcylbbnVtYmVyXT4pIHtcbiAgICBpZiAoIWlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdyZXF1ZXN0IG9wdGlvbnMgc2hvdWxkIGJlIG9mIHR5cGUgXCJvYmplY3RcIicpXG4gICAgfVxuICAgIHRoaXMucmVxT3B0aW9ucyA9IF8ucGljayhvcHRpb25zLCByZXF1ZXN0T3B0aW9uUHJvcGVydGllcylcbiAgfVxuXG4gIC8qKlxuICAgKiAgVGhpcyBpcyBzMyBTcGVjaWZpYyBhbmQgZG9lcyBub3QgaG9sZCB2YWxpZGl0eSBpbiBhbnkgb3RoZXIgT2JqZWN0IHN0b3JhZ2UuXG4gICAqL1xuICBwcml2YXRlIGdldEFjY2VsZXJhdGVFbmRQb2ludElmU2V0KGJ1Y2tldE5hbWU/OiBzdHJpbmcsIG9iamVjdE5hbWU/OiBzdHJpbmcpIHtcbiAgICBpZiAoIWlzRW1wdHkodGhpcy5zM0FjY2VsZXJhdGVFbmRwb2ludCkgJiYgIWlzRW1wdHkoYnVja2V0TmFtZSkgJiYgIWlzRW1wdHkob2JqZWN0TmFtZSkpIHtcbiAgICAgIC8vIGh0dHA6Ly9kb2NzLmF3cy5hbWF6b24uY29tL0FtYXpvblMzL2xhdGVzdC9kZXYvdHJhbnNmZXItYWNjZWxlcmF0aW9uLmh0bWxcbiAgICAgIC8vIERpc2FibGUgdHJhbnNmZXIgYWNjZWxlcmF0aW9uIGZvciBub24tY29tcGxpYW50IGJ1Y2tldCBuYW1lcy5cbiAgICAgIGlmIChidWNrZXROYW1lLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUcmFuc2ZlciBBY2NlbGVyYXRpb24gaXMgbm90IHN1cHBvcnRlZCBmb3Igbm9uIGNvbXBsaWFudCBidWNrZXQ6JHtidWNrZXROYW1lfWApXG4gICAgICB9XG4gICAgICAvLyBJZiB0cmFuc2ZlciBhY2NlbGVyYXRpb24gaXMgcmVxdWVzdGVkIHNldCBuZXcgaG9zdC5cbiAgICAgIC8vIEZvciBtb3JlIGRldGFpbHMgYWJvdXQgZW5hYmxpbmcgdHJhbnNmZXIgYWNjZWxlcmF0aW9uIHJlYWQgaGVyZS5cbiAgICAgIC8vIGh0dHA6Ly9kb2NzLmF3cy5hbWF6b24uY29tL0FtYXpvblMzL2xhdGVzdC9kZXYvdHJhbnNmZXItYWNjZWxlcmF0aW9uLmh0bWxcbiAgICAgIHJldHVybiB0aGlzLnMzQWNjZWxlcmF0ZUVuZHBvaW50XG4gICAgfVxuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgLyoqXG4gICAqIHJldHVybnMgb3B0aW9ucyBvYmplY3QgdGhhdCBjYW4gYmUgdXNlZCB3aXRoIGh0dHAucmVxdWVzdCgpXG4gICAqIFRha2VzIGNhcmUgb2YgY29uc3RydWN0aW5nIHZpcnR1YWwtaG9zdC1zdHlsZSBvciBwYXRoLXN0eWxlIGhvc3RuYW1lXG4gICAqL1xuICBwcm90ZWN0ZWQgZ2V0UmVxdWVzdE9wdGlvbnMob3B0czogUmVxdWVzdE9wdGlvbik6IElSZXF1ZXN0ICYgeyBob3N0OiBzdHJpbmc7IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfSB7XG4gICAgY29uc3QgbWV0aG9kID0gb3B0cy5tZXRob2RcbiAgICBjb25zdCByZWdpb24gPSBvcHRzLnJlZ2lvblxuICAgIGNvbnN0IGJ1Y2tldE5hbWUgPSBvcHRzLmJ1Y2tldE5hbWVcbiAgICBsZXQgb2JqZWN0TmFtZSA9IG9wdHMub2JqZWN0TmFtZVxuICAgIGNvbnN0IGhlYWRlcnMgPSBvcHRzLmhlYWRlcnNcbiAgICBjb25zdCBxdWVyeSA9IG9wdHMucXVlcnlcblxuICAgIGxldCByZXFPcHRpb25zID0ge1xuICAgICAgbWV0aG9kLFxuICAgICAgaGVhZGVyczoge30gYXMgUmVxdWVzdEhlYWRlcnMsXG4gICAgICBwcm90b2NvbDogdGhpcy5wcm90b2NvbCxcbiAgICAgIC8vIElmIGN1c3RvbSB0cmFuc3BvcnRBZ2VudCB3YXMgc3VwcGxpZWQgZWFybGllciwgd2UnbGwgaW5qZWN0IGl0IGhlcmVcbiAgICAgIGFnZW50OiB0aGlzLnRyYW5zcG9ydEFnZW50LFxuICAgIH1cblxuICAgIC8vIFZlcmlmeSBpZiB2aXJ0dWFsIGhvc3Qgc3VwcG9ydGVkLlxuICAgIGxldCB2aXJ0dWFsSG9zdFN0eWxlXG4gICAgaWYgKGJ1Y2tldE5hbWUpIHtcbiAgICAgIHZpcnR1YWxIb3N0U3R5bGUgPSBpc1ZpcnR1YWxIb3N0U3R5bGUodGhpcy5ob3N0LCB0aGlzLnByb3RvY29sLCBidWNrZXROYW1lLCB0aGlzLnBhdGhTdHlsZSlcbiAgICB9XG5cbiAgICBsZXQgcGF0aCA9ICcvJ1xuICAgIGxldCBob3N0ID0gdGhpcy5ob3N0XG5cbiAgICBsZXQgcG9ydDogdW5kZWZpbmVkIHwgbnVtYmVyXG4gICAgaWYgKHRoaXMucG9ydCkge1xuICAgICAgcG9ydCA9IHRoaXMucG9ydFxuICAgIH1cblxuICAgIGlmIChvYmplY3ROYW1lKSB7XG4gICAgICBvYmplY3ROYW1lID0gdXJpUmVzb3VyY2VFc2NhcGUob2JqZWN0TmFtZSlcbiAgICB9XG5cbiAgICAvLyBGb3IgQW1hem9uIFMzIGVuZHBvaW50LCBnZXQgZW5kcG9pbnQgYmFzZWQgb24gcmVnaW9uLlxuICAgIGlmIChpc0FtYXpvbkVuZHBvaW50KGhvc3QpKSB7XG4gICAgICBjb25zdCBhY2NlbGVyYXRlRW5kUG9pbnQgPSB0aGlzLmdldEFjY2VsZXJhdGVFbmRQb2ludElmU2V0KGJ1Y2tldE5hbWUsIG9iamVjdE5hbWUpXG4gICAgICBpZiAoYWNjZWxlcmF0ZUVuZFBvaW50KSB7XG4gICAgICAgIGhvc3QgPSBgJHthY2NlbGVyYXRlRW5kUG9pbnR9YFxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaG9zdCA9IGdldFMzRW5kcG9pbnQocmVnaW9uISlcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodmlydHVhbEhvc3RTdHlsZSAmJiAhb3B0cy5wYXRoU3R5bGUpIHtcbiAgICAgIC8vIEZvciBhbGwgaG9zdHMgd2hpY2ggc3VwcG9ydCB2aXJ0dWFsIGhvc3Qgc3R5bGUsIGBidWNrZXROYW1lYFxuICAgICAgLy8gaXMgcGFydCBvZiB0aGUgaG9zdG5hbWUgaW4gdGhlIGZvbGxvd2luZyBmb3JtYXQ6XG4gICAgICAvL1xuICAgICAgLy8gIHZhciBob3N0ID0gJ2J1Y2tldE5hbWUuZXhhbXBsZS5jb20nXG4gICAgICAvL1xuICAgICAgaWYgKGJ1Y2tldE5hbWUpIHtcbiAgICAgICAgaG9zdCA9IGAke2J1Y2tldE5hbWV9LiR7aG9zdH1gXG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0TmFtZSkge1xuICAgICAgICBwYXRoID0gYC8ke29iamVjdE5hbWV9YFxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBGb3IgYWxsIFMzIGNvbXBhdGlibGUgc3RvcmFnZSBzZXJ2aWNlcyB3ZSB3aWxsIGZhbGxiYWNrIHRvXG4gICAgICAvLyBwYXRoIHN0eWxlIHJlcXVlc3RzLCB3aGVyZSBgYnVja2V0TmFtZWAgaXMgcGFydCBvZiB0aGUgVVJJXG4gICAgICAvLyBwYXRoLlxuICAgICAgaWYgKGJ1Y2tldE5hbWUpIHtcbiAgICAgICAgcGF0aCA9IGAvJHtidWNrZXROYW1lfWBcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3ROYW1lKSB7XG4gICAgICAgIHBhdGggPSBgLyR7YnVja2V0TmFtZX0vJHtvYmplY3ROYW1lfWBcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocXVlcnkpIHtcbiAgICAgIHBhdGggKz0gYD8ke3F1ZXJ5fWBcbiAgICB9XG4gICAgcmVxT3B0aW9ucy5oZWFkZXJzLmhvc3QgPSBob3N0XG4gICAgaWYgKChyZXFPcHRpb25zLnByb3RvY29sID09PSAnaHR0cDonICYmIHBvcnQgIT09IDgwKSB8fCAocmVxT3B0aW9ucy5wcm90b2NvbCA9PT0gJ2h0dHBzOicgJiYgcG9ydCAhPT0gNDQzKSkge1xuICAgICAgcmVxT3B0aW9ucy5oZWFkZXJzLmhvc3QgPSBgJHtob3N0fToke3BvcnR9YFxuICAgIH1cbiAgICByZXFPcHRpb25zLmhlYWRlcnNbJ3VzZXItYWdlbnQnXSA9IHRoaXMudXNlckFnZW50XG4gICAgaWYgKGhlYWRlcnMpIHtcbiAgICAgIC8vIGhhdmUgYWxsIGhlYWRlciBrZXlzIGluIGxvd2VyIGNhc2UgLSB0byBtYWtlIHNpZ25pbmcgZWFzeVxuICAgICAgZm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMoaGVhZGVycykpIHtcbiAgICAgICAgcmVxT3B0aW9ucy5oZWFkZXJzW2sudG9Mb3dlckNhc2UoKV0gPSB2XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gVXNlIGFueSByZXF1ZXN0IG9wdGlvbiBzcGVjaWZpZWQgaW4gbWluaW9DbGllbnQuc2V0UmVxdWVzdE9wdGlvbnMoKVxuICAgIHJlcU9wdGlvbnMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLnJlcU9wdGlvbnMsIHJlcU9wdGlvbnMpXG5cbiAgICByZXR1cm4ge1xuICAgICAgLi4ucmVxT3B0aW9ucyxcbiAgICAgIGhlYWRlcnM6IF8ubWFwVmFsdWVzKF8ucGlja0J5KHJlcU9wdGlvbnMuaGVhZGVycywgaXNEZWZpbmVkKSwgKHYpID0+IHYudG9TdHJpbmcoKSksXG4gICAgICBob3N0LFxuICAgICAgcG9ydCxcbiAgICAgIHBhdGgsXG4gICAgfSBzYXRpc2ZpZXMgaHR0cHMuUmVxdWVzdE9wdGlvbnNcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBzZXRDcmVkZW50aWFsc1Byb3ZpZGVyKGNyZWRlbnRpYWxzUHJvdmlkZXI6IENyZWRlbnRpYWxQcm92aWRlcikge1xuICAgIGlmICghKGNyZWRlbnRpYWxzUHJvdmlkZXIgaW5zdGFuY2VvZiBDcmVkZW50aWFsUHJvdmlkZXIpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuYWJsZSB0byBnZXQgY3JlZGVudGlhbHMuIEV4cGVjdGVkIGluc3RhbmNlIG9mIENyZWRlbnRpYWxQcm92aWRlcicpXG4gICAgfVxuICAgIHRoaXMuY3JlZGVudGlhbHNQcm92aWRlciA9IGNyZWRlbnRpYWxzUHJvdmlkZXJcbiAgICBhd2FpdCB0aGlzLmNoZWNrQW5kUmVmcmVzaENyZWRzKClcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgY2hlY2tBbmRSZWZyZXNoQ3JlZHMoKSB7XG4gICAgaWYgKHRoaXMuY3JlZGVudGlhbHNQcm92aWRlcikge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgY3JlZGVudGlhbHNDb25mID0gYXdhaXQgdGhpcy5jcmVkZW50aWFsc1Byb3ZpZGVyLmdldENyZWRlbnRpYWxzKClcbiAgICAgICAgdGhpcy5hY2Nlc3NLZXkgPSBjcmVkZW50aWFsc0NvbmYuZ2V0QWNjZXNzS2V5KClcbiAgICAgICAgdGhpcy5zZWNyZXRLZXkgPSBjcmVkZW50aWFsc0NvbmYuZ2V0U2VjcmV0S2V5KClcbiAgICAgICAgdGhpcy5zZXNzaW9uVG9rZW4gPSBjcmVkZW50aWFsc0NvbmYuZ2V0U2Vzc2lvblRva2VuKClcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmFibGUgdG8gZ2V0IGNyZWRlbnRpYWxzOiAke2V9YCwgeyBjYXVzZTogZSB9KVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuIl0sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEtBQUtBLElBQUk7QUFDaEIsT0FBTyxLQUFLQyxLQUFLO0FBRWpCLE9BQU9DLENBQUMsTUFBTSxRQUFRO0FBRXRCLFNBQVNDLGtCQUFrQixRQUFRLDJCQUEwQjtBQUM3RCxPQUFPLEtBQUtDLE1BQU0sTUFBTSxlQUFjO0FBQ3RDLFNBQ0VDLGdCQUFnQixFQUNoQkMsU0FBUyxFQUNUQyxTQUFTLEVBQ1RDLE9BQU8sRUFDUEMsUUFBUSxFQUNSQyxRQUFRLEVBQ1JDLGVBQWUsRUFDZkMsV0FBVyxFQUNYQyxrQkFBa0IsRUFDbEJDLGlCQUFpQixRQUNaLGNBQWE7QUFFcEIsU0FBU0MsYUFBYSxRQUFRLG9CQUFtQjtBQUdqRDtB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