declare const awsS3Endpoint: {
    'us-east-1': string;
    'us-east-2': string;
    'us-west-1': string;
    'us-west-2': string;
    'ca-central-1': string;
    'eu-west-1': string;
    'eu-west-2': string;
    'sa-east-1': string;
    'eu-central-1': string;
    'ap-south-1': string;
    'ap-southeast-1': string;
    'ap-southeast-2': string;
    'ap-northeast-1': string;
    'cn-north-1': string;
    'ap-east-1': string;
    'eu-north-1': string;
};
export type Region = keyof typeof awsS3Endpoint | string;
export declare function getS3Endpoint(region: Region): string;
export {};
//# sourceMappingURL=s3-endpoints.d.ts.map