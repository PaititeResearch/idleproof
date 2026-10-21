// Explicit synthetic demo, kept isolated from all user repositories and credentials.
import {createServer} from '../src/server.mjs';
import {tempAtlasFixture} from './atlas-fixture.mjs';
const index=process.argv.indexOf('--port');const port=index<0?4779:Number(process.argv[index+1]);
if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid port');
const fixture=tempAtlasFixture();const app=await createServer({cwd:fixture.cwd,port,experimentalAtlas:true});
console.log(JSON.stringify({url:app.url+'/atlas.html',fixture:'SYNTHETIC; not your repository',paidGeneration:false}));
let stopping=false;function stop(){if(stopping)return;stopping=true;app.server.close(()=>{fixture.close();process.exit(0);});app.server.closeAllConnections?.();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
