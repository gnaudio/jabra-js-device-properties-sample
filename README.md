# Jabra JS SDK4 Properties & Button Customization demo

This project is a browser-based demo showing how to work with Properties and Button Customization in the Jabra JS SDK. 

## Features
- Connect to Jabra devices using WebHID
- Read and set device properties (firmware version, sidetone on/off)
- Subscribe to headset telemetry events (background noise, speech analytics, audio exposure)
- Customize the 3-dot button LED color and mode (including custom RGB)

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
- Click "Grant WebHID permission to headset" to connect a device if using WebHID (no installed components needed).
- Use the dropdowns to set the 3-dot button LED color and mode.
- For custom colors, select "Custom (RGB)", enter values (0–255), and click Apply.
- Output and device logs appear in the on-page textbox.

## Development
- Built with Vite and ES modules
- Uses Jabra SDK packages and RxJS