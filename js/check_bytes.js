const fs = require('fs');
['main.js','app.js'].forEach(fn => {
  try {
    const p = require('path').join(__dirname, fn);
    const b = fs.readFileSync(p);
    console.log('---', fn, 'len', b.length);
    console.log('bytes', Array.from(b.slice(0,16)));
    console.log('text-start:', b.toString('utf8',0,200));
  } catch (e) {
    console.error('ERR reading', fn, e && e.message);
  }
});
