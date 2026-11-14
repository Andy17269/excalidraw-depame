import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Acde } from '../scripts/acde-driver.mjs';
import { createNativeFixture, enterCanvas } from '../scripts/native-fixture.mjs';
import { configureLiveAi } from '../scripts/live-ai-fixture.mjs';
const output = resolve(process.env.CANVAS_TEST_OUTPUT || '.debug/ai-live');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(output, 'profile-'));
const acde = await Acde.launch({ cwd: await createNativeFixture(profile), out: join(profile, 'build'), headless: true, env: { XDG_DATA_HOME: join(profile, 'data'), XDG_CONFIG_HOME: join(profile, 'config'), XDG_STATE_HOME: join(profile, 'state'), ACDE_STORAGE: '' } });
try {
  const app = acde.window('excalidraw-depame');
  await acde.route('/api/network/status', { json: { online: true, checkedAt: Date.now() } });
  await configureLiveAi(app);
  await enterCanvas(app);
  await app.getByRole('button',{name:'选择',exact:true}).click({timeout:20000});
  await app.evaluate(`(()=>{window.aiResponses=[];const original=window.fetch;window.fetch=async(...args)=>{const response=await original(...args);if(String(args[0]).startsWith('/api/'))void response.clone().text().then(text=>window.aiResponses.push({url:String(args[0]),status:response.status,body:text.slice(0,2500)}));return response};return true})()`);
  for (const prompt of ['画一个简单的用户登录流程图，包含输入账号、校验、成功三个步骤','在现有图右侧追加一个退出登录节点','画一张系统架构图','画一张学习计划思维导图']) {
    const before=JSON.parse(await app.evaluate('window.canvasBridge.read_canvas()')).length;
    await app.getByRole('textbox',{name:'描述',exact:true}).fill(prompt);
    await app.getByRole('button',{name:'生成',exact:true}).click();
    for(let i=0;i<480;i++) {
      await new Promise(r=>setTimeout(r,250));
      if(await app.evaluate('document.querySelector(".generate-button").textContent!=="生成中"'))break;
    }
    const result=await app.evaluate('JSON.stringify({button:document.querySelector(".generate-button").textContent,scene:window.canvasBridge.read_canvas(),responses:window.aiResponses})');
    const decoded=JSON.parse(result);
    console.log(JSON.stringify({prompt,button:decoded.button,count:JSON.parse(decoded.scene).length,response:decoded.responses.at(-1)}));
    await app.screenshot({path:join(output,before?'context.png':'blank.png')});
    assert.ok(JSON.parse(JSON.parse(result).scene).length>before,'Real AI generation did not add diagram');
    if (prompt.includes('思维导图')) assert.ok(JSON.parse(decoded.scene).length>before+3,'Mindmap must contain editable nodes, not a fallback image');
  }
  console.log('PASS live DeepSeek generation from blank and existing canvas');
} catch(error) { console.error(error.message); console.error(JSON.stringify((await acde.console({level:'errors'})).entries)); console.error(acde.logs?.tail(8).text); process.exitCode=1; }
finally { await acde.close(); }
