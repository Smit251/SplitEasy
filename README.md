# SplitEasy - Expense Sharing Web App

A modern, responsive web application for tracking and splitting expenses with friends and groups. Built with vanilla JavaScript and Firebase, this project demonstrates a clean architecture for a dynamic single-page application (SPA).

 <!-- Optional: Add a screenshot of your app -->

## Features

- **Dashboard Overview**: At-a-glance view of your total balances, who you owe, and who owes you.
- **Detailed Expense Tracking**: Add expenses with descriptions, amounts, dates, and categories.
- **Flexible Splitting Methods**:
    - Split **Equally** among participants.
    - Split by **Exact Amounts**.
    - Split by **Percentage**.
    - Split by **Shares**.
- **Friend & Group Management**: Create groups of friends for recurring expenses (e.g., housemates, trips).
- **Settle Up**: Easily record payments to clear balances with friends, either manually or directly from the dashboard.
- **Activity Feed**: A complete history of all your expenses and payments.
- **Data Visualization**: A doughnut chart for spending by category and a summary of monthly spending totals.
- **Secure & Private**: Uses Firebase Anonymous Authentication to keep your data private to your browser session.

## Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Styling**: Tailwind CSS
- **Database & Auth**: Google Firebase (Firestore, Anonymous Authentication)
- **Charts**: Chart.js

## Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

- A modern web browser (Chrome, Firefox, etc.)
- A Google account to create a Firebase project.

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/SplitEasy.git
    cd SplitEasy
    ```

2.  **Set up Firebase:**
    - Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
    - In your new project, go to the **Authentication** section, click the **Sign-in method** tab, and enable **Anonymous** authentication.
    - Go to the **Firestore Database** section and create a database. Start in **Test mode** for easy setup; you can secure it with rules later.

3.  **Update the Firebase config:**
    - In your Firebase project settings (click the gear icon ⚙️ > Project settings), find your web app's configuration object.
    - Open the `firebase-config.js` file in this project and replace the placeholder values with your actual Firebase project configuration.

4.  **Run the application:**
    - Simply open the `index.html` file in your web browser. Because this project uses ES6 modules, you may need to serve it from a local server. A simple way to do this is with the Live Server extension for VS Code.

## File Structure

```
/
├── index.html          # Main HTML file, the entry point of the app
├── style.css           # Custom CSS styles
├── app.js              # Core application logic (ES6 Module)
├── firebase-config.js  # Your Firebase project configuration
├── firebase.json       # Firebase hosting configuration
└── .gitignore          # Specifies files for Git to ignore
```

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
```