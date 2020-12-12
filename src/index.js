/**
 * Budgeteer main server.
 * @author James Grams
 */

const express = require("express");
const puppeteer = require("puppeteer");
const fs = require("fs");
const readline = require("readline");
const crypto = require("crypto");

const PORT = 8001;
const DATABASE_FILE = "database.json";
const ERROR_MESSAGES = {
    bucketAlreadyExists: "A bucket with that name already exists",
    bucketDoesNotExist: "That bucket does not exist",
    expenseDoesNotExist: "That expense does not exist",
    noName: "Please include a name",
    noBudget: "Please include a budget",
    invalidBudget: "Invalid budget"
};
const INTERVAL_TIME = 1000 * 60 * 30; // updates every 30 minutes
const TD_BANK_URL = "https://onlinebanking.tdbank.com/#/authentication/login";
const USERNAME = process.env.BUDGETEER_USERNAME;
const PASSWORD = process.env.BUDGETEER_PASSWORD;
const USER_AGENT = process.env.USER_AGENT || "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";
const MONTH_KEY_SEPERATOR = "--";
const HTTP_SEMANTIC_ERROR = 422;
const HTTP_OK = 200;
const HTTP_TEMPORARILY_UNAVAILABLE = 503;
const SUCCESS = "success";
const FAILURE = "failure";

let database;
let monthKey;

/**{
    "months": {
        "<month-year>": {
            "buckets": {
                "<bucket_name>": {
                    "budget": "<number>"
                }
            },
            "expenses": {
                "<expense hash>": {
                    "date": "<date>",
                    "type": "<type>",
                    "description": "<description>",
                    "amount": "<amount>",
                    "status": "<status>",
                    "bucket": "<bucket name or null>"
                }
            }
        }
    }
}
background function will update expenses and copy buckets to the next month if we start a new month.
*/

/**************** Main Program ****************/

const app = express();
app.use( express.json() );
app.use( "/assets", express.static("assets") );

// Endpoint to serve the basic HTML needed to run this app
app.get("/", async function(request, response) {
    console.log("app serving / (GET)");
    request.url = "/assets";
    app.handle(request, response);
});

// Get a list of all expenses for the month
app.get("/expenses", (request, response) => {
    console.log("app serving /expenses");
    let expenses = getExpenses();
    writeResponse(response, SUCCESS, {expenses: expenses});
});

// Assign an expense to 
app.post("/assign", (request, response) => {
    console.log("app serving /assign");
    let responseVal = assignExpense(request.body.expenseHash, request.body.bucketName);
    writeActionResponse(response, responseVal);
});

// Get buckets
app.get("/buckets", (request, response) => {
    console.log("app serving /buckets");
    let buckets = getBuckets();
    writeResponse(response, SUCCESS, {buckets: buckets});
});

// Add a bucket
app.post("/bucket", (request, response) => {
    console.log("app serving /bucket (POST)");
    let responseVal = addBucket(request.body.name, request.body.budget);
    writeActionResponse(response, responseVal);
});

// Update a bucket
app.put("/bucket", (request, response) => {
    console.log("app serving /bucket (PUT)");
    let responseVal = updateBucket(request.body.oldName, request.body.name, request.body.budget);
    writeActionResponse(response, responseVal);
});

// Delete a bucket
app.delete("/bucket", (request, response) => {
    console.log("app serving /bucket (DELETE)");
    let responseVal = deleteBucket(request.body.name);
    writeActionResponse(response, responseVal);
});

/**
 * Write a standard response for when an action is taken.
 * @param {Response} response - The response object.
 * @param {string} errorMessage - The error message from running the code.
 */
function writeActionResponse( response, errorMessage ) {
    if( errorMessage ) {
        writeResponse( response, FAILURE, { "message": errorMessage }, HTTP_SEMANTIC_ERROR );
    }
    else {
        writeResponse( response, SUCCESS );
    }
}

/**
 * Send a response to the user.
 * @param {Response} response - The response object.
 * @param {string} status - The status of the request.
 * @param {Object} object - An object containing values to include in the response.
 * @param {number} code - The HTTP response code (defaults to 200).
 * @param {string} contentType - The content type of the response (defaults to application/json).
 */
function writeResponse( response, status, object, code, contentType ) {
    if( !code ) { code = HTTP_OK; }
    if( !contentType ) { contentType = "application/json"; }
    if( !object ) { object = {}; }
    response.writeHead(code, {'Content-Type': 'application/json'});
    
    let responseObject = Object.assign( {status:status}, object );
    response.end(JSON.stringify(responseObject));
}

readDatabase();
mainLoop();
app.listen(PORT);

/**************** Functions ****************/

/**
 * Perform the main program loop.
 */
async function mainLoop() {
    try {
        checkNewMonth(); // Important this is first
        writeDatabase();
        await fetchExpenses();
    }
    catch(err) {
        console.log(err);
        // need to continue
    }
    setTimeout(mainLoop, INTERVAL_TIME);
}

/**
 * Fetch expenses
 */
async function fetchExpenses() {
    let browser = await puppeteer.launch({
        headless: true
    });
    let page = await browser.newPage();
    if(USER_AGENT) page.setUserAgent(USER_AGENT); // Be sure to login with this user agent.
    await page.goto(TD_BANK_URL);
    await page.waitForSelector("input[name='psudoUsername']");
    await page.waitForSelector("input[name='password']");
    await page.type("input[name='psudoUsername']", USERNAME);
    await page.type("input[name='password']", PASSWORD);
    await page.click(".td-login-button");
    console.log("clicked login");
    try {
        await page.waitForSelector("button[ng-click=\"submitFunction('SMS')\"]", {timeout: 5000}); // click this
        await page.waitForTimeout(4000);
        await page.click("button[ng-click=\"submitFunction('SMS')\"]");
        await page.waitForSelector("input[name='challengeCode']");
        let promise = new Promise((resolve, reject) => { // get their text code

            let rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            })
            rl.question("What is the code texted to you? ", (answer) => {
                rl.close();
                resolve(answer);
            });

        })
        let challengeCode = await promise;
        await page.type("input[name='challengeCode']", challengeCode);
        await page.keyboard.press("Enter"); // submit
        await page.waitForSelector('[ng-click="selectAccount(account)"]');
    }
    catch(err) {
        // ok - already verified
    }
    await page.click('[ng-click="selectAccount(account)"]');
    console.log("clicked account");
    
    // click 60 days.
    await page.waitForSelector('select[ng-model="showLast"]');
    await page.focus('select[ng-model="showLast"]');
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForSelector("tbody");
    console.log("clicked 60 days");

    // scroll to the bottom
    // it is in infinite scroll, so keep scrolling until the bottom doesn't change
    let prevBottom;
    while( true ) {
        await page.evaluate( () => {
            window.scrollTo(0,document.body.scrollHeight);
        });
        await page.waitForTimeout(2000); // 2 seconds to load
        let bottom = await page.evaluate( () => document.body.scrollHeight );

        if( prevBottom === bottom ) break;
        prevBottom = bottom;
    }
    console.log("scrolled to bottom");
    
    let expenses = await page.evaluate( (monthKey, MONTH_KEY_SEPERATOR) => {
        let expenses = [];
        document.querySelector("tbody").querySelectorAll("tr:not(.header-row)").forEach( row => { 
            let columns = row.querySelectorAll("td");
            let amount = columns[4].innerText;
            let date = columns[1].innerText;
            let status = columns[5].innerText;
            let matchDate = date.split("/")[0] + MONTH_KEY_SEPERATOR + date.split("/")[2];
            // an expense not a credit
            // can't do pending because sometimes the hash will change due to description being more specific
            if( amount.match("-") && matchDate === monthKey && status !== "Pending" ) {
                expenses.push( {
                    "date": date,
                    "type": columns[2].innerText,
                    "description": columns[3].innerText,
                    "amount": parseFloat(amount.replace(/[-\$,]/g,"")),
                    "status": status,
                    "bucket": null
                } );
            }
        } );
        return expenses;
    }, monthKey, MONTH_KEY_SEPERATOR );

    console.log("fetched expenses");
    for( let expense of expenses ) {
        let hash = crypto.createHash('md5').update(expense.date + expense.type + expense.description + expense.amount).digest('hex');
        if( !database.months[monthKey].expenses[hash] ) {
            database.months[monthKey].expenses[hash] = expense;
        }
    }
    writeDatabase();
    await browser.close();
    console.log("browser closed");
    return Promise.resolve();
}

/**
 * Check if we are in a new month. 
 * Copy buckets from the old month to the new one if need be.
 */
function checkNewMonth() {
    let newMonthKey = getMonthKey();
    if( monthKey !== newMonthKey && !database.months[newMonthKey] ) { // there is no month key on startup, so we need the second conditional as well so we don't overwrite
        // create the new entry
        database.months[newMonthKey] = {
            buckets: {},
            expenses: {}
        }
        // copy the buckets
        if( monthKey ) {
            database.months[newMonthKey].buckets = JSON.parse(JSON.stringify(database.months[monthKey].buckets));
        }
        monthKey = newMonthKey; // important this is done after we add the entry for the monthKey to the object, otherwise, some of our functions using monthKey may throw an error
        writeDatabase();
    }
    else if( !monthKey ) { // startup w/ pre-existing db
        monthKey = newMonthKey;
    }
}

/**
 * Get expenses (for the current month).
 * Note: This does not fetch them, this just reads them.
 * @returns {Array|string} - An error message if there is one or the array of expenses if there is not.
 */
function getExpenses() {
    return database.months[monthKey].expenses;
}

/**
 * Get buckets (for the current month).
 */
function getBuckets() {
    return database.months[monthKey].buckets;
}

/**
 * Add a bucket.
 * @param {string} name - The name of the bucket.
 * @param {number} budget - The budget for this bucket.
 * @returns {boolean|string} - An error message if there is one or false if there is not.
 */
function addBucket(name, budget) {
    // check for duplicate names
    if( database.months[monthKey].buckets[name] ) return ERROR_MESSAGES.bucketAlreadyExists;
    if( !name ) return ERROR_MESSAGES.noName;
    if( !budget ) return ERROR_MESSAGES.noBudget;
    if( !parseFloat(budget) ) return ERROR_MESSAGES.invalidBudget;

    database.months[monthKey].buckets[name] = {
        "budget": parseFloat(budget)
    }
    writeDatabase();
    return false;
}

/**
 * Update a bucket.
 * @param {string} [oldName] - The name of the bucket to update.
 * @param {string} [name] - The new name of the bucket.
 * @param {number} [budget] - The new budget for this bucket.
 * @returns {boolean|string} - An error message if there is one or false if there is not.
 */
function updateBucket(oldName, name, budget) {
    if( !database.months[monthKey].buckets[oldName] ) return ERROR_MESSAGES.bucketDoesNotExist;
    if( name && database.months[monthKey].buckets[name] ) return ERROR_MESSAGES.bucketAlreadyExists;
    if( budget && !parseFloat(budget) ) return ERROR_MESSAGES.invalidBudget;

    if( name ) {
        database.months[monthKey].buckets[name] = database.months[monthKey].buckets[oldName];
        for( let expense in database.months[monthKey].expenses ) {
            if( database.months[monthKey].expenses[expense].bucket === oldName ) {
                database.months[monthKey].expenses[expense].bucket = name; // update the expense bucket
            }
        }
        delete database.months[monthKey].buckets[oldName];
        oldName = name; // going forward, we use the new name.
    }
    if( budget ) {
        database.months[monthKey].buckets[oldName].budget = parseFloat(budget);
    }
    writeDatabase();
    return false;
}

/**
 * Delete a bucket.
 * @param {string} name - The name of the bucket to delete.
 * @returns {boolean|string} - An error message if there is one or false if there is not.
 */
function deleteBucket(name) {
    if( !database.months[monthKey].buckets[name] ) return ERROR_MESSAGES.bucketDoesNotExist;
    
    for( let expense in database.months[monthKey].expenses ) {
        if( database.months[monthKey].expenses[expense].bucket === name ) {
            database.months[monthKey].expenses[expense].bucket = null; // update the expense bucket
        }
    }
    delete database.months[monthKey].buckets[name];
    writeDatabase();
    return false;
}

/**
 * Assign expense to a bucket.
 * @param {string} expenseHash - The identifier for the expense. 
 * @param {string|null} bucketName - The name of the bucket to assign the expense to.
 * @returns {boolean|string} - An error message if there is one or false if there is not.
 */
function assignExpense(expenseHash, bucketName) {
    if( !database.months[monthKey].buckets[bucketName] && bucketName !== null ) return ERROR_MESSAGES.bucketDoesNotExist;
    if( !database.months[monthKey].expenses[expenseHash] ) return ERROR_MESSAGES.expenseDoesNotExist;

    database.months[monthKey].expenses[expenseHash].bucket = bucketName;
    writeDatabase();
    return false;
}

/**
 * Get the current month key.
 * @returns {string} - The month key for the database.
 * @returns {boolean|string} - An error message if there is one or false if there is not.
 */
function getMonthKey() {
    let date = new Date();
    return (date.getMonth()+1) + MONTH_KEY_SEPERATOR + date.getFullYear();
}

/**
 * Read the database into memory.
 */
function readDatabase() {
    if( fs.existsSync(DATABASE_FILE) ) {
        database = JSON.parse(fs.readFileSync(DATABASE_FILE));
    }
    else {
        database = {
            "months": {}
        };
    }
}

/**
 * Write the database to disk.
 */
function writeDatabase() {
    fs.writeFileSync(DATABASE_FILE, JSON.stringify(database));
}