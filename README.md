# X Follower Analyzer

This project is a TypeScript-based solution that analyzes your X followers, identifies potential bots, and provides options to block or remove them.

## Prerequisites

Before running this project, make sure you have the following installed:
- Node.js (version 14 or later)
- npm (usually comes with Node.js)

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/x-follower-analyzer.git
   cd x-follower-analyzer
   ```

2. Install the dependencies:
   ```
   npm install
   ```

## Running the Analyzer

1. Create a `.env.local` file in the project root with your X credentials:
   ```
   USERNAME=your_username
   PASSWORD=your_password
   ```

2. Build the project:
   ```
   npm run build
   ```

3. Run the analyzer:
   ```
   npm start
   ```

The script will load your credentials from the `.env.local` file, launch a browser, log into your X account, and start analyzing your followers. For each potential bot detected, it will ask you whether you want to block or remove them. You can respond with 'Y' for yes or 'N' for no.

## Important Notes

- Keep your `.env.local` file secure and never commit it to version control.
- This tool uses web scraping techniques and may break if X changes its website structure.
- Using automated scripts to interact with X may violate their terms of service. Use this tool responsibly and at your own risk.
- The bot detection criteria are based on general patterns and may not be 100% accurate. Always review the results before taking action.

## License

This project is licensed under the GNU Affero General Public License v3.0. See the LICENSE file for details.
