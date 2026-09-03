const fs = require("fs");
const path = require("path");
const source = path.resolve(process.argv[2] || "../daily_options_trade_klines");
const target = path.resolve(process.argv[3] || "data");
fs.mkdirSync(target,{recursive:true});
const pattern=/_(15m|1h)_(\d{4}-\d{2}-\d{2})_all_klines\.csv$/i;
const manifest=[];
for(const file of fs.readdirSync(source)){
  const match=file.match(pattern);if(!match)continue;
  const from=path.join(source,file),to=path.join(target,file);fs.copyFileSync(from,to);
  const stat=fs.statSync(to);manifest.push({file,interval:match[1].toLowerCase(),date:match[2],size:stat.size});
}
manifest.sort((a,b)=>b.date.localeCompare(a.date)||a.interval.localeCompare(b.interval));
fs.writeFileSync(path.join(target,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log(`Copied ${manifest.length} files (${(manifest.reduce((n,x)=>n+x.size,0)/1048576).toFixed(1)} MB)`);
