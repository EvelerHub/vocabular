## Installation

### Chrome / Chromium / Edge
1. Download `vocabular-chrome-__VERSION__.zip` and unzip it
2. Go to `chrome://extensions` → enable **Developer mode**
3. Click **Load unpacked** → select the unzipped folder

### Firefox
1. Download `vocabular-firefox-__VERSION__.zip` *(do not unzip)*
2. Go to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…** → select the `.zip` file

> The temporary add-on is removed when Firefox restarts.
> For a **persistent install without signing**, use Firefox Developer Edition or Firefox Nightly:
> 1. Go to `about:config` → accept the risk warning
> 2. Set `xpinstall.signatures.required` to `false`
> 3. Go to `about:addons` → gear icon → **Install Add-on From File** → select the `.zip`
>
> Standard Firefox releases cannot permanently install unsigned extensions.
