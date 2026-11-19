export default async function (configuration)
{
    console.log(`Personal build: skipping code signing for ${configuration.path}`);
    return;
}
