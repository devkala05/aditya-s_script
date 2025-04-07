import puppeteer from "puppeteer";
import fs from "fs";

const restartAfterTimeout = async (prompts) => {
  console.log("\nSong generation took too long! Restarting after 20 minutes...\n");
  await new Promise(resolve => setTimeout(resolve, 20 * 60 * 1000));
  await init(prompts);
};

const main = async (page, text, count = 1) => {
  if (count > 5) {
    console.log(`❌ Prompt "${text}" failed after 5 tries`);
    return "fail";
  }

  await page.waitForSelector('h4.text-primary.truncate.transition-colors');
  let song_names_prev = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h4.text-primary.truncate.transition-colors')).map(h4 => h4.textContent);
  });

  await page.waitForSelector('div.flex.h-12.w-full.min-w-0.cursor-pointer.items-center.gap-1');
  await page.click('div.flex.h-12.w-full.min-w-0.cursor-pointer.items-center.gap-1');

  await page.waitForSelector('textarea[aria-label="Prompt for a song"]');
  await page.focus('textarea[aria-label="Prompt for a song"]');
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  await page.type('textarea[aria-label="Prompt for a song"]', text);

  await page.waitForSelector('button[data-sentry-element="Button"][data-sentry-source-file="Create.tsx"]');
  await page.click('button[data-sentry-element="Button"][data-sentry-source-file="Create.tsx"]');

  try {
    await page.waitForFunction(() => {
      const h4Elements = Array.from(document.querySelectorAll('h4'));
      return h4Elements.every(h4 => !h4.textContent.trim().startsWith('Generating'));
    }, { timeout: 100000 });
  } catch (error) {
    console.log("\n⏱️ Song generation took too long!");
    return "fail";
  }

  await page.waitForSelector('h4.text-primary.truncate.transition-colors');
  const h4_arr = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h4.text-primary.truncate.transition-colors')).map(h4 => h4.textContent);
  });

  if (h4_arr.at(0) === song_names_prev.at(0) || h4_arr.at(1) === song_names_prev.at(1)) {
    console.log(`⚠️ Generation failed for: "${text}", retrying... Try #${count + 1}`);
    return await main(page, text, count + 1);
  }

  const datetime = new Date(Date.now());
  fs.appendFileSync(process.argv[3], `Prompt: ${text}    (${datetime.toLocaleString()})\n  Song 1: ${h4_arr.at(0)}\n  Song 2: ${h4_arr.at(1)}\n\n`);

  const buttons = await page.$$('button[aria-label^="More options for"]');
  for (let i = 0; i < 2; i++) {
    buttons[i].click();
    await page.waitForSelector('svg[aria-hidden="true"][data-icon="cloud-arrow-down"]');
    await page.hover('svg[aria-hidden="true"][data-icon="cloud-arrow-down"]');
    await page.waitForSelector('svg[aria-hidden="true"][data-icon="file-music"]');
    await page.click('svg[aria-hidden="true"][data-icon="file-music"]');
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const fileContents = fs.readFileSync(process.argv[2], "utf-8").replace(text + "\n", "");
  fs.writeFileSync(process.argv[2], fileContents);
  console.log(`✅ Downloaded: ${text}`);
  return "success";
};


const init = async (prompts) => {
  if (prompts.length === 0 || (prompts.length === 1 && prompts[0] === '')) {
    console.log("Empty prompts file!");
    return;
  }

  const browser = await puppeteer.launch({
    browser: "firefox",
    headless: false,
    userDataDir: "/home/devsharma/.mozilla/firefox/6bliaw4s.default-release",
  });

  const page = (await browser.pages()).at(0);
  await page.goto("https://riffusion.com");

  let consecutiveFails = 0;

  for (let i = 0; i < prompts.length; i++) {
    const text = prompts[i];
    const result = await main(page, text);

    if (result === "success") {
      consecutiveFails = 0;
    } else {
      consecutiveFails++;
      if (consecutiveFails >= 2) {
        console.log("\n🚨 Two prompts failed back-to-back. Closing browser and retrying after 20 minutes...");
        await browser.close();
        await new Promise(res => setTimeout(res, 20 * 60 * 1000)); // 30 mins
        const remainingPrompts = fs.readFileSync(process.argv[2], 'utf-8').trim().split("\n");
        await init(remainingPrompts);
        return;
      }
    }
  }

  console.log("\n🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 🎉 All prompts processed!");
  await browser.close(); 
};


if (process.argv.length !== 4) {
  console.error("ERROR!\nUsage: node src/main.js <path/to/prompts> <path/to/log_file>");
  process.exit(1);
}

fs.readFile(process.argv[2], 'utf-8', (err, data) => {
  if (err) {
    console.log(err);
  } else {
    init(data.trim().split("\n"));
  }
});
