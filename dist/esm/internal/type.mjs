// nodejs IncomingHttpHeaders is Record<string, string | string[]>, but it's actually this:

export let ENCRYPTION_TYPES = /*#__PURE__*/function (ENCRYPTION_TYPES) {
  ENCRYPTION_TYPES["SSEC"] = "SSE-C";
  ENCRYPTION_TYPES["KMS"] = "KMS";
  return ENCRYPTION_TYPES;
}({});
export let RETENTION_MODES = /*#__PURE__*/function (RETENTION_MODES) {
  RETENTION_MODES["GOVERNANCE"] = "GOVERNANCE";
  RETENTION_MODES["COMPLIANCE"] = "COMPLIANCE";
  return RETENTION_MODES;
}({});
export let RETENTION_VALIDITY_UNITS = /*#__PURE__*/function (RETENTION_VALIDITY_UNITS) {
  RETENTION_VALIDITY_UNITS["DAYS"] = "Days";
  RETENTION_VALIDITY_UNITS["YEARS"] = "Years";
  return RETENTION_VALIDITY_UNITS;
}({});
export let LEGAL_HOLD_STATUS = /*#__PURE__*/function (LEGAL_HOLD_STATUS) {
  LEGAL_HOLD_STATUS["ENABLED"] = "ON";
  LEGAL_HOLD_STATUS["DISABLED"] = "OFF";
  return LEGAL_HOLD_STATUS;
}({});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJFTkNSWVBUSU9OX1RZUEVTIiwiUkVURU5USU9OX01PREVTIiwiUkVURU5USU9OX1ZBTElESVRZX1VOSVRTIiwiTEVHQUxfSE9MRF9TVEFUVVMiXSwic291cmNlcyI6WyJ0eXBlLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlICogYXMgaHR0cCBmcm9tICdub2RlOmh0dHAnXG5cbmV4cG9ydCB0eXBlIEJpbmFyeSA9IHN0cmluZyB8IEJ1ZmZlclxuXG4vLyBub2RlanMgSW5jb21pbmdIdHRwSGVhZGVycyBpcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBzdHJpbmdbXT4sIGJ1dCBpdCdzIGFjdHVhbGx5IHRoaXM6XG5leHBvcnQgdHlwZSBSZXNwb25zZUhlYWRlciA9IFJlY29yZDxzdHJpbmcsIHN0cmluZz5cblxuZXhwb3J0IHR5cGUgT2JqZWN0TWV0YURhdGEgPSBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXI+XG5cbmV4cG9ydCB0eXBlIFJlcXVlc3RIZWFkZXJzID0gUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgYm9vbGVhbiB8IG51bWJlciB8IHVuZGVmaW5lZD5cblxuZXhwb3J0IHR5cGUgRW5jcnlwdGlvbiA9XG4gIHwge1xuICAgICAgdHlwZTogRU5DUllQVElPTl9UWVBFUy5TU0VDXG4gICAgfVxuICB8IHtcbiAgICAgIHR5cGU6IEVOQ1JZUFRJT05fVFlQRVMuS01TXG4gICAgICBTU0VBbGdvcml0aG0/OiBzdHJpbmdcbiAgICAgIEtNU01hc3RlcktleUlEPzogc3RyaW5nXG4gICAgfVxuXG5leHBvcnQgZW51bSBFTkNSWVBUSU9OX1RZUEVTIHtcbiAgLyoqXG4gICAqIFNTRUMgcmVwcmVzZW50cyBzZXJ2ZXItc2lkZS1lbmNyeXB0aW9uIHdpdGggY3VzdG9tZXIgcHJvdmlkZWQga2V5c1xuICAgKi9cbiAgU1NFQyA9ICdTU0UtQycsXG4gIC8qKlxuICAgKiBLTVMgcmVwcmVzZW50cyBzZXJ2ZXItc2lkZS1lbmNyeXB0aW9uIHdpdGggbWFuYWdlZCBrZXlzXG4gICAqL1xuICBLTVMgPSAnS01TJyxcbn1cblxuZXhwb3J0IGVudW0gUkVURU5USU9OX01PREVTIHtcbiAgR09WRVJOQU5DRSA9ICdHT1ZFUk5BTkNFJyxcbiAgQ09NUExJQU5DRSA9ICdDT01QTElBTkNFJyxcbn1cblxuZXhwb3J0IGVudW0gUkVURU5USU9OX1ZBTElESVRZX1VOSVRTIHtcbiAgREFZUyA9ICdEYXlzJyxcbiAgWUVBUlMgPSAnWWVhcnMnLFxufVxuXG5leHBvcnQgZW51bSBMRUdBTF9IT0xEX1NUQVRVUyB7XG4gIEVOQUJMRUQgPSAnT04nLFxuICBESVNBQkxFRCA9ICdPRkYnLFxufVxuXG5leHBvcnQgdHlwZSBUcmFuc3BvcnQgPSBQaWNrPHR5cGVvZiBodHRwLCAncmVxdWVzdCc+XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlcXVlc3Qge1xuICBwcm90b2NvbDogc3RyaW5nXG4gIHBvcnQ/OiBudW1iZXIgfCBzdHJpbmdcbiAgbWV0aG9kOiBzdHJpbmdcbiAgcGF0aDogc3RyaW5nXG4gIGhlYWRlcnM6IFJlcXVlc3RIZWFkZXJzXG59XG5cbmV4cG9ydCB0eXBlIElDYW5vbmljYWxSZXF1ZXN0ID0gc3RyaW5nXG4iXSwibWFwcGluZ3MiOiJBQUlBOztBQWlCQSxXQUFZQSxnQkFBZ0IsMEJBQWhCQSxnQkFBZ0I7RUFBaEJBLGdCQUFnQjtFQUFoQkEsZ0JBQWdCO0VBQUEsT0FBaEJBLGdCQUFnQjtBQUFBO0FBVzVCLFdBQVlDLGVBQWUsMEJBQWZBLGVBQWU7RUFBZkEsZUFBZTtFQUFmQSxlQUFlO0VBQUEsT0FBZkEsZUFBZTtBQUFBO0FBSzNCLFdBQVlDLHdCQUF3QiwwQkFBeEJBLHdCQUF3QjtFQUF4QkEsd0JBQXdCO0VBQXhCQSx3QkFBd0I7RUFBQSxPQUF4QkEsd0JBQXdCO0FBQUE7QUFLcEMsV0FBWUMsaUJBQWlCLDBCQUFqQkEsaUJBQWlCO0VBQWpCQSxpQkFBaUI7RUFBakJBLGlCQUFpQjtFQUFBLE9BQWpCQSxpQkFBaUI7QUFBQSJ9