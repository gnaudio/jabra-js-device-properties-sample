# Jabra JS SDK4 Properties & Remote MMI Playground

This project is a browser-based playground for experimenting with the Jabra JavaScript SDK v4, including device property access and remote MMI (button/LED) customization.

## Features
- Connect to Jabra devices using WebHID
- View and set device properties (firmware version, mute state, etc.)
- Control the 3-dot button LED color and mode (including custom RGB)
- Live output log in the browser
- Modern UI with dropdowns for color and LED mode

## Getting Started

1. **Install dependencies:**
	```sh
	npm install
	```
2. **Start the dev server:**
	```sh
	npm start
	```
3. **Open your browser:**
	Go to the URL shown in the terminal (usually http://localhost:5173)

## Usage
- Click "Add Jabra headset" to connect a device.
- Use the dropdowns to set the 3-dot button LED color and mode.
- For custom colors, select "Custom (RGB)", enter values (0–255), and click Apply.
- Output and device logs appear in the on-page textbox.

## Development
- Built with Vite and ES modules
- Uses Jabra SDK packages and RxJS