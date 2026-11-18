import { test,expect } from '@playwright/test';
import sharp from 'sharp';

async function signIn(page,email='alex@dogdiscovery.demo') {
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Email address').fill(email);
  await dialog.getByLabel('Password',{exact:true}).fill('Discover123!');
  await dialog.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('link',{name:'My account'})).toBeVisible();
}

test('desktop discovery, search, filters, profile, and keyboard dismissal',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.dog-card')).toHaveCount(8);
  await expect(page.getByRole('heading',{name:'Your next best friend is out there.'})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('desktop.png'),fullPage:true});
  await page.getByRole('button',{name:'Puppies',exact:true}).click();
  await expect(page.locator('.dog-card')).toHaveCount(2);
  await expect(page.locator('.dog-card').first()).toContainText('Milo');
  await page.getByRole('button',{name:'All dogs',exact:true}).click();
  await page.getByLabel('Search dogs').fill('Maple');
  await expect(page.locator('.dog-card')).toHaveCount(1);
  await page.locator('.dog-card').getByRole('button',{name:'Maple',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('A little about me');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByLabel('Search dogs').fill('NoSuchDog123');
  await expect(page.getByRole('heading',{name:'No little faces here just yet.'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile navigation, filtering, and viewport fit',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  await expect(page.locator('.dog-card')).toHaveCount(8);
  await page.screenshot({path:testInfo.outputPath('mobile.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.getByRole('button',{name:'Toggle navigation'}).click();
  await page.getByRole('link',{name:'Saved',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Keep your favorites close.'})).toBeVisible();
  await page.getByRole('button',{name:'Toggle navigation'}).click();
  await page.getByRole('button',{name:'How it works'}).click();
  await expect(page.getByRole('dialog')).toContainText('Start with a hello');
  await page.getByRole('button',{name:'Close dialog'}).click();
});

test('adopter saves, applies, messages; rescue replies and accepts the adoption',async({page,browser})=>{
  await page.goto('/');await signIn(page);
  await page.getByRole('button',{name:'Save Maple',exact:true}).click();
  await page.getByRole('link',{name:/Saved/}).click();
  await expect(page.locator('.dog-card')).toHaveCount(1);
  await page.locator('.dog-card').getByRole('button',{name:'Maple',exact:true}).click();
  await page.getByRole('button',{name:'I’d love to meet Maple'}).click();
  await page.getByRole('dialog').getByRole('textbox').fill('I have a lovely home with a garden and would love a companion for daily walks.');
  await page.getByRole('button',{name:'Send introduction'}).click();
  await expect(page.locator('.toast[role="status"]')).toContainText('Your introduction is on its way');
  await page.getByRole('button',{name:'Ask a question'}).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Hello! Does Maple enjoy long walks?');
  await page.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.locator('.message-feed')).toContainText('Does Maple enjoy long walks?');
  const context=await browser.newContext();const owner=await context.newPage();
  await owner.goto('http://127.0.0.1:3100');await signIn(owner,'rescue@dogdiscovery.demo');
  await owner.getByRole('link',{name:'Messages',exact:true}).click();
  await owner.locator('.conversation-list a').first().click();
  await owner.getByLabel('Your message').fill('Yes, Maple loves a long walk and a nap afterward.');
  await owner.getByRole('button',{name:'Send message',exact:true}).click();
  await expect(page.locator('.message-feed')).toContainText('Maple loves a long walk',{timeout:12000});
  await owner.getByRole('link',{name:'My account'}).click();
  await owner.getByRole('button',{name:/Adoption requests/}).click();
  await owner.getByRole('button',{name:'Accept adoption'}).click();
  await owner.getByRole('button',{name:'Confirm adoption'}).click();
  await expect(owner.locator('.application')).toContainText('accepted');
  await page.getByRole('link',{name:'Discover dogs',exact:true}).click();
  await expect(page.locator('.dog-card')).toHaveCount(7);
  await context.close();
});

test('create, edit, pause, and delete a listing with a real photo upload',async({page})=>{
  await page.goto('/');await signIn(page,'rescue@dogdiscovery.demo');
  await page.getByRole('link',{name:'My account'}).click();
  await page.getByRole('button',{name:'List a dog',exact:true}).click();
  const photo=await sharp({create:{width:240,height:200,channels:3,background:'#a4b78c'}}).png().toBuffer();
  await page.locator('input[type=file]').setInputFiles({name:'test-dog.png',mimeType:'image/png',buffer:photo});
  await expect(page.getByRole('button',{name:'Remove photo 1'})).toBeVisible();
  await page.getByLabel('Dog’s name').fill('Browser Buddy');
  await page.getByLabel('Breed or mix').fill('Terrier mix');
  await page.getByLabel('Age in months').fill('18');
  await page.getByLabel('Their story').fill('A cheerful little dog who enjoys cuddles, long naps, and new friends.');
  await page.getByRole('button',{name:'Publish listing'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const card=page.locator('.dog-card').filter({hasText:'Browser Buddy'});
  await expect(card).toBeVisible();
  await card.getByRole('button',{name:'Manage Browser Buddy'}).click();
  await page.getByLabel('Listing visibility').selectOption('paused');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(card).toContainText('paused');
  await card.locator('..').getByRole('button',{name:'Delete listing',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Delete listing',exact:true}).click();
  await expect(card).toHaveCount(0);
});

test('Google and GitHub sign-in complete through the Supabase PKCE callback',async({page},testInfo)=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continue with Google'})).toBeEnabled();
  await page.screenshot({path:testInfo.outputPath('oauth-sign-in.png')});
  await page.getByRole('button',{name:'Continue with Google'}).click();
  await expect(page.getByRole('heading',{name:'Hello, Alex.'})).toBeVisible();
  await expect(page).not.toHaveURL(/auth_success|access_token|refresh_token/);
  const cookies=await page.context().cookies();
  expect(cookies.filter(x=>x.name.startsWith('dd-supabase-session')).every(x=>x.httpOnly)).toBeTruthy();
  expect(await page.evaluate(()=>document.cookie)).not.toContain('dd-supabase-session');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Continue with GitHub'}).click();
  await expect(page.getByRole('heading',{name:'Hello, Sunny.'})).toBeVisible();
});

test('confirmation and cancelled OAuth show useful recovery states',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Create an account',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Your name').fill('New Adopter');
  await dialog.getByLabel('Email address').fill('confirm-browser@example.com');
  await dialog.getByLabel('Password',{exact:true}).fill('Password123!');
  await dialog.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(dialog.getByRole('heading',{name:'Check your email'})).toBeVisible();
  await expect(page.getByRole('link',{name:'My account'})).toHaveCount(0);
  await page.goto('/api/auth/callback?error=access_denied');
  await expect(page.locator('.toast')).toContainText('Sign-in was cancelled');
  await expect(page.getByRole('button',{name:'Continue with Google'})).toBeVisible();
});
