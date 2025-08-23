ChatGPT Automation Script  

This script automates sending prompts to ChatGPT (web) and saves the responses into a JSON file.  

------------------------------------------------------------
Requirements  
------------------------------------------------------------
- Node.js (v18 or higher recommended)  
- npm (comes with Node.js)  
- Google Chrome (installed in the default path)  

------------------------------------------------------------
Setup  
------------------------------------------------------------
1. Unzip the project folder.  
2. Open a terminal in the project folder.  
3. Run the following command to install dependencies:  

   npm install puppeteer puppeteer-extra puppeteer-extra-plugin-stealth

   This will create the node_modules/ folder automatically.  

------------------------------------------------------------
Usage  
------------------------------------------------------------

First Run (login required)  
---------------------------
1. Run the script:  

   node gpt.js

2. Chrome will open.  
   - Log in with your ChatGPT account (Pro or Free).  
   - Once logged in, return to the terminal and press ENTER.  

3. The script will read prompts from prompts.csv and save results into output.json.  

4. A folder named chrome_profile/ will be created automatically.  
   - This saves your login so you don’t have to log in again next time.  

Next Runs (auto-login)  
------------------------
1. Run the script again:  

   node gpt.js

2. Since your profile is saved, the script will ask:  

   Run in headless mode? (y/n)

   - y → Runs in background (no browser window).  
   - n → Runs visibly in Chrome.  

------------------------------------------------------------
Files  
------------------------------------------------------------
- gpt.js → Main automation script.  
- prompts.csv → Input file (write one prompt per line).  
- output.json → Script output (prompts + ChatGPT responses).  
- package.json / package-lock.json → Dependencies for Node.js.  
- chrome_profile/ → Auto-created on first run to save login session.  

------------------------------------------------------------
Switching Accounts  
------------------------------------------------------------
If you want to log in with a different ChatGPT account:  
1. Close Chrome.  
2. Delete the chrome_profile/ folder.  
3. Run the script again — it will ask you to log in.  

------------------------------------------------------------
That’s it! Add your prompts in prompts.csv, run the script, and you’ll get answers saved in output.json.  
