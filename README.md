# Budgeteer

![Budgeteer Logo](https://raw.githubusercontent.com/jamesgrams/budgeteer/master/assets/logo.png)

## About

Budgeteer is a pirate-themed budgeting program designed to be run on your local network. It displays expenses from your checking account as Doubloons that can be put into customizable buckets (chests). The software will allow you to track how much you have spent on each bucket and overall. Currently, it works with expenses for the current month - i.e. lets you keep a monthly budget. This software will scrape expenses from a TD Bank checking account.

## Setup

1. Make sure you have node and npm installed.
2. Clone this repository.
3. `cd` to this repository.
4. `npm install`
5. Set the environment variables, `BUDGETEER_USERNAME` and `BUDGETEER_PASSWORD` to your TD Bank credentials.
6. Run `npm start`.
7. On the first time running, you may have to enter a code from a text message you receive for security, so keep an eye out for console prompts. You can also enter this code by clicking `Enter a code` in the GUI.
8. Optionally setup your computer up to run this program on startup and save the environment variables permanently.
9. Access the program by going to the computer you set it up on's IP and port 8001 (e.g. http://192.168.1.44:8001). You can drag the Doubloons into the chests, and click a chest to see and edits details.
