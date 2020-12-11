
// buckets and expenses local copies
let bucketsDict, expensesDict;
let closeModalCallback;

/**
 * Load.
 */
function load() {
    setLoadingMain();
    draw();
    document.querySelector("#add-bucket").onclick = displayAddBucket;
}

/**
 * Draw.
 */
async function draw() {
    let promise = new Promise( (resolve, reject) => {
        let bucketsResponse, expensesResponse;
        let finish = function() {
            try {
                stopLoadingMain();
            }
            catch(err) {}
            bucketsDict = bucketsResponse.buckets;
            expensesDict = expensesResponse.expenses;
            document.querySelector("main").innerHTML = "";
            createTotalsSection();
            createExpensesSection();
            createBucketsSection();
            resolve();
        }
        fetch("/buckets").then( (response) => {
            response.json().then( (json) => {
                bucketsResponse = json;
                if( expensesResponse ) finish();
            } );
        });
        fetch("/expenses").then( (response) => {
            response.json().then( (json) => {
                expensesResponse = json;
                if( bucketsResponse ) finish();
            } );
        });
    });
    await promise;
    let bucketModal = document.querySelector("#bucket-modal");
    if( bucketModal ) {
        bucketModal.parentElement.replaceChild(createBucketModal(bucketModal.getAttribute("data-new-bucket") || bucketModal.getAttribute("data-bucket")), bucketModal);
    }
}

/**
 * Set the main section to display loading.
 */
function setLoadingMain() {
    document.querySelector("#loading").classList.remove("hidden");
}

/**
 * Stop loading main.
 */
function stopLoadingMain() {
    document.querySelector("#loading").classList.add("hidden");
}

/**
 * Create the totals section.
 */
function createTotalsSection() {
    let totalsSection = document.createElement("div");
    totalsSection.setAttribute("id", "totals-section");

    let totalBudget = 0;
    let totalExpenses = 0;

    for( let expense in expensesDict ) {
        totalExpenses += expensesDict[expense].amount;
        console.log(expense.amount)
    }
    for( let bucket in bucketsDict ) {
        totalBudget += bucketsDict[bucket].budget;
    }

    totalsSection.innerText = formatMoney(totalExpenses) + " / " + formatMoney(totalBudget);
    if( totalExpenses > totalBudget ) {
        totalsSection.classList.add("over");
    }

    document.querySelector("main").appendChild(totalsSection);
}

/**
 * Create the buckets section.
 */
function createBucketsSection() {
    let section = createSection("Chests");
    section.setAttribute("id", "buckets-section");
    
    let keysInOrder = Object.keys(bucketsDict).sort( (a,b) => {
        a = a.toLowerCase();
        b = b.toLowerCase();
        if( a < b ) return -1;
        if( b < a ) return 1;
        return 0;
    } );
    for( let bucket of keysInOrder ) {
        let expense = calculateExpense(bucket);
        let item = createItem(bucket, formatMoney(expense) + " / " + formatMoney(bucketsDict[bucket].budget));
        item.ondragover = (e) => {
            if( e ) e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            return false;
        }
        item.ondrop = (e) => {
            if( e ) e.stopPropagation();
            let expense = e.dataTransfer.getData('text/html');
            assignExpense( expense, bucket );
            return false;
        };
        let counter = 0;
        item.ondragenter = (e) => {
            e.preventDefault();
            counter ++;
            item.classList.add("filled");
        }
        item.ondragleave = (e) => {
            counter --;
            if( !counter ) item.classList.remove("filled");
        }
        item.onclick = function(e) {
            launchModal( e, createBucketModal(bucket) );
        }

        // indicator that we're over budget
        if( expense > bucketsDict[bucket].budget ) {
            item.querySelector(".subtitle").classList.add("over");
        }

        section.querySelector(".items").appendChild(item);
    }

    document.querySelector("main").appendChild(section);
}

/**
 * Format money.
 * @param {number} float - The floating point for the money.
 * @returns {string} The formatted money string. 
 */
function formatMoney(float) {
    return "$" + float.toFixed(2);
}

/**
 * Calculate the current expenses for a bucket.
 * @param {string} bucket - The name of the bucket to calculate expenses for.
 * @returns {number} - The expense.
 */
function calculateExpense(bucket) {
    return Object.values(getExpensesForBucket(bucket)).reduce( (prev, curr) => prev + curr.amount, 0 );
}

/**
 * Get expenses for a bucket.
 * @param {string} bucket - The name of the bucket to get expenses for.
 * @returns {Object} - An object of expenses with keys being the hash and values being the value. 
 */
function getExpensesForBucket(bucket) {
    let matchingBuckets = Object.keys(expensesDict).filter( el => expensesDict[el].bucket === bucket );
    let obj = {};
    for( let matchingBucket of matchingBuckets ) {
        obj[matchingBucket] = expensesDict[matchingBucket];
    }
    return obj;
}

/**
 * Create a modal for buckets.
 * @param {string} bucket - The name of the buckets to create a modal for.
 * @returns {HTMLElement} The bucket form.
 */
function createBucketModal(bucket) {
    let form = document.createElement("div");
    form.setAttribute("id", "bucket-modal");
    form.setAttribute("data-bucket", bucket);

    let title = document.createElement("h2");
    title.innerText = bucket;
    form.appendChild(title);

    let money = calculateExpense(bucket);
    let moneyElement = document.createElement("div");
    moneyElement.classList.add("expenses");
    moneyElement.innerText =  formatMoney(money) + " / " + formatMoney(bucketsDict[bucket].budget);
    if( money > bucketsDict[bucket].budget ) {
        moneyElement.classList.add("over");
    }
    form.appendChild(moneyElement);

    // create a list of expenses
    let expenseList = document.createElement("ul");
    let bucketExpenses = getExpensesForBucket(bucket);
    let keysInOrder = Object.keys(bucketExpenses).sort( (a,b) => {
        a = expensesDict[a].date;
        b = expensesDict[b].date;
        if( a > b ) return -1;
        if( b < a ) return 1;
        return 0;
    } )
    for( let expense of keysInOrder ) {
        let li = document.createElement("li");
        li.innerHTML = `${bucketExpenses[expense].date} -- ${bucketExpenses[expense].description} -- ${formatMoney(bucketExpenses[expense].amount)}`;
        let removeButton = document.createElement("Button");
        removeButton.innerText = "X";
        removeButton.classList.add("remove-button");
        removeButton.onclick = () => {
            assignExpense( expense, null );
        }
        li.appendChild(removeButton);
        expenseList.appendChild(li);
    }
    form.appendChild(expenseList);
    
    // edit section
    let editButton = document.createElement("button");
    editButton.innerText = "Alter this Chest";
    editButton.onclick = () => {
        editButton.classList.add("hidden");
        let editSection = document.createElement("div");
        editSection.setAttribute("id", "edit-section");
        
        editSection.appendChild(createInput("name", "Name: ", "text"));
        editSection.appendChild(createInput("budget", "Budget: ", "number"));

        //delete
        let deleteButton = document.createElement("button");
        deleteButton.innerText = "Throw Away";
        deleteButton.setAttribute("id","delete-button");
        deleteButton.onclick = () => {
            deleteBucket(bucket);
        };
        // cancel
        let cancelButton = document.createElement("button");
        cancelButton.innerText = "Cancel Changes";
        cancelButton.onclick = () => {
            editSection.parentElement.removeChild(editSection);
            editButton.classList.remove("hidden");
        }
        // save
        let saveButton = document.createElement("button");
        saveButton.innerText = "Make Changes";
        saveButton.onclick = () => {
            form.setAttribute("data-new-bucket", form.querySelector("#name").value);
            updateBucket(bucket, form.querySelector("#name").value, form.querySelector("#budget").value);
        }
        editSection.appendChild(saveButton);
        editSection.appendChild(cancelButton);
        editSection.appendChild(deleteButton);

        form.appendChild(editSection);
    }
    form.appendChild(editButton);

    return form;
}

/** 
 * Create the expenses section
 * 
 */
function createExpensesSection() {
    let section = createSection("Doubloons");
    section.setAttribute("id", "expenses-section");

    let keysInOrder = Object.keys(expensesDict).sort( (a,b) => {
        a = expensesDict[a].date;
        b = expensesDict[b].date;
        if( a > b ) return -1;
        if( b < a ) return 1;
        return 0;
    } );
    for( let expense of keysInOrder ) {
        if( !expensesDict[expense].bucket ) {
            let item = createItem(formatMoney(expensesDict[expense].amount), expensesDict[expense].date, expensesDict[expense].description);
            item.setAttribute("draggable", true);
            item.ondragstart = (e) => {
                item.classList.add("alpha");
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData("text/html", expense);
            }
            item.ondragend = () => {
                item.classList.remove("alpha");
            }
            section.querySelector(".items").appendChild(item);
        }
    }

    document.querySelector("main").appendChild(section);
}

/**
 * Create a section.
 * @param {string} title - The title of the section.
 * @returns {HTMLElement} The HTML element for the section. 
 */
function createSection(title) {
    let wrapper = document.createElement("div");
    wrapper.classList.add("section");
    let titleElement = document.createElement("h2");
    titleElement.innerText = title;
    wrapper.appendChild(titleElement);
    let itemsElement = document.createElement("div");
    itemsElement.classList.add("items");
    wrapper.appendChild(itemsElement);
    return wrapper;
}

/**
 * Create a display item.
 * @param {string} title - The title.
 * @param {string} [subtitle] - The optional subtitle.
 * @param {string} [subsubtitle] - The optional subsubtitle.
 */
function createItem(title, subtitle, subsubtitle, includeWrapper) {
    let item = document.createElement("div");
    item.classList.add("item");
    let wrapper = document.createElement("div");
    wrapper.classList.add("wrapper");
    item.appendChild(wrapper);
    let titleElement = document.createElement("div");
    titleElement.innerText = title;
    titleElement.classList.add("title");
    wrapper.appendChild(titleElement);
    if( subtitle ) {
        let subtitleElement = document.createElement("div");
        subtitleElement.innerText = subtitle;
        subtitleElement.classList.add("subtitle");
        wrapper.appendChild(subtitleElement);
    }
    if( subsubtitle ) {
        let subsubtitleElement = document.createElement("div");
        subsubtitleElement.innerText = subsubtitle;
        subsubtitleElement.classList.add("subsubtitle");
        wrapper.appendChild(subsubtitleElement);
    }
    return item;
}

/**
 * Create input.
 * @param {string} name - The name of the element.
 * @param {string} label - The label for the element.
 * @param {string} type - The input type.
 * @returns {HTMLElement} The label element containing the input
 */
function createInput(name, label, type) {
    let input = document.createElement("input");
    input.setAttribute("name",name);
    input.setAttribute("id",name);
    input.setAttribute("type",type);
    let labelElement = document.createElement("label");
    let labelSpan = document.createElement("span");
    labelSpan.innerText = label;
    labelElement.appendChild(labelSpan);
    labelElement.setAttribute("for",name);
    labelElement.appendChild(input);
    return labelElement;
}

/**
 * Display add bucket.
 * @param {Event} e - The event to open the modal.
 */
function displayAddBucket(e) {
    let form = document.createElement("div");
    form.setAttribute("id", "add-bucket-modal");

    let title = document.createElement("h2");
    title.innerText = "Build a Chest";
    form.appendChild(title);

    form.appendChild(createInput("name", "Name: ", "text"));
    form.appendChild(createInput("budget", "Budget: ", "number"));

    let button = document.createElement("button");
    button.innerText = "Build";
    button.onclick = () => {
        addBucket(form.querySelector("#name").value, form.querySelector("#budget").value);
    };
    form.appendChild(button);

    launchModal(e, form);
}

/**
 * Launch a modal.
 * @param {HTMLElement} element - The element within the modal.
 * @param {Function} [closeModalCallbackFunction] - A function to set the global closeModalCallback to after any current modal has closed.
 */
function launchModal( e, element, closeModalCallbackFunction ) {
    if(e) e.stopPropagation();
    closeModal(); // Close any current modal
    if( closeModalCallbackFunction ) {
        closeModalCallback = closeModalCallbackFunction;
    }
    let modal = document.createElement("div");
    modal.classList.add("modal");
    modal.appendChild(element);
    document.body.appendChild(modal);
    // set timeout to force draw prior
    setTimeout( function() { 
        modal.classList.add("modal-shown");
        document.body.classList.add("modal-open");
    }, 0 );
    modal.onclick = function(e) { e.stopPropagation(); };
    document.body.onclick = closeModal;
}

/**
 * Close the modal on the page.
 */
function closeModal() {
    let modal = document.querySelector(".modal");
    if( modal ) {
        modal.classList.remove("modal"); // We need to do this as to not get it mixed up with another modal
        modal.classList.add("dying-modal"); // Dummy modal class for css
        modal.classList.remove("modal-shown");
        document.body.classList.remove("modal-open");
        // sometimes a modal callback will check for an active modal, so it is important this comes after
        // we remove the modal class and add dying-modal
        if( closeModalCallback ) {
            closeModalCallback();
            closeModalCallback = null;
        }
        // set timeout to force draw prior
        setTimeout( function() { 
            if( modal && modal.parentElement ) {
                modal.parentElement.removeChild(modal);
            }
        }, 500 ); // Make sure this matches the transition time in the css
        document.body.onclick = function() {};
    }
}

/**
 * Standard request.
 * @param {string} method - The HTTP method. 
 * @param {string} url - The url. 
 * @param {Object} body - The body. 
 * @param {Function} callback - The callback function. 
 */
function standardRequest(method, url, body, callback) {
    let failure = (response) => {
        if( !response || !response.json ) createToast("An unexpected error ocurred");
        else {
            response.json().then( (json) => {
                createToast(json.message);
            } ).catch( (err) => {
                createToast("An unexpected error ocurred");
            } ); 
        }
    };

    fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    }).then( (response) => {
        if( response.status !== 200 ) {
            failure(response);
        }
        else {
            draw();
            if( callback ) callback();
        }
    } ).catch( failure );
}

/**
 * Assign an expense to a bucket.
 * @param {string} expenseHash - The expense hash. 
 * @param {string} bucketName - The name of the bucket the expense will go into.
 */
function assignExpense(expenseHash, bucketName) {
    standardRequest( "POST", "/assign", {
        expenseHash: expenseHash,
        bucketName: bucketName
    } );
}

/**
 * Add a new bucket
 * @param {string} name - The name of the new bucket.
 * @param {number} budget - The budget for the new bucket.
 */
function addBucket(name, budget) {
    standardRequest( "POST", "/bucket", {
        name: name,
        budget: budget
    }, closeModal );
}

/**
 * Update a bucket.
 * @param {string} oldName - The old name. 
 * @param {string} [name] - The new name.
 * @param {number} [budget] - The new budget.
 */
function updateBucket(oldName, name, budget) {
    standardRequest( "PUT", "/bucket", {
        oldName, oldName,
        name: name,
        budget: budget
    }, () => {
        let editSection = document.querySelector("#edit-section");
        editSection.parentElement.removeChild(editSection);
        document.querySelector(".modal button").classList.remove("hidden");
    } );
}

/**
 * Delete a bucket.
 * @param {string} name - The name of the bucket to delete. 
 */
function deleteBucket(name) {
    standardRequest( "DELETE", "/bucket", {
        name: name
    }, closeModal );
}

/**
 * Create a toast.
 * @param {string} message - The message to display in the toast.
 * @param {string} [type] - The type of toast (success or failure).
 * @param {boolean} [html] - True if the message is in HTML.
 */
function createToast(message, type, html) {
    var toast = document.createElement("div");
    toast.classList.add("toast");
    if( html ) toast.innerHTML = message;
    else toast.innerText = message;
    var appendElement = document.body;
    appendElement.appendChild(toast);
    setTimeout( function() { // Timeout for opacity
        toast.classList.add("toast-shown");
        setTimeout( function() { // Timeout until hiding
            toast.classList.remove("toast-shown");
            setTimeout( function() { // Timeout until removing
                toast.parentElement.removeChild(toast);
            }, 500 ); // Make sure this matches the css
        }, 4000 )
    }, 0 ); // Set timeout to add the opacity transition
}

window.addEventListener("load", load);