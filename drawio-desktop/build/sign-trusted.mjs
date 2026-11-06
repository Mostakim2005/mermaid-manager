import path from 'path';
import fs from 'fs';
import os from 'os';

export default async function (configuration)
{
    console.log(`Personal build: skipping code signing for ${configuration.path}`);
    return;
}
