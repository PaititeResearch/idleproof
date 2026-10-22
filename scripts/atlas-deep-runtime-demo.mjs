// Explicit fixed synthetic scenario only. No installation or user project execution.
import {runtimeAvailability,buildRuntimeDemo} from '../src/atlas-deep-runtime.mjs';
const args=process.argv.slice(2);
if(args.length!==1||!['--check-isolation','--run-fixed-synthetic-fixture'].includes(args[0])){
  console.error('Usage: node scripts/atlas-deep-runtime-demo.mjs --check-isolation | --run-fixed-synthetic-fixture');process.exitCode=2;
}else {
  const result=args[0]==='--check-isolation'?await runtimeAvailability():await buildRuntimeDemo();
  console.log(JSON.stringify(result,null,2));if(result.status==='UNAVAILABLE')process.exitCode=3;else if(['FAILED','INTERRUPTED'].includes(result.status))process.exitCode=1;
}
