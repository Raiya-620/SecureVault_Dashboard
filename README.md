# SecureVault File Explorer

## Overview

SecureVault File Explorer is a browser‑based file explorer built using **HTML, CSS, and Vanilla JavaScript**. It allows users to browse folders, preview supported files, and inspect file metadata. The application loads its data dynamically from a `data.json` file using the **Fetch API**, as required by the assessment specification.

This project demonstrates important frontend engineering concepts such as:

* Recursive rendering of hierarchical data
* Separation of concerns
* State management
* Event delegation
* Defensive programming
* Accessible UI design

## Features

### Core Features

* Load file and folder structure from `data.json` using `fetch()`
* Recursive folder tree rendering
* Expand and collapse folders
* File preview support
* File metadata inspector
* File actions menu (View Details, Delete)
* Delete confirmation modal
* Search functionality
* Keyboard navigation support


### File Preview Support

Preview is available for:

* Images: `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp`, `.gif`
* Text files: `.txt`, `.json`, `.md`, `.log`, `.yaml`, `.yml`

Preview is restricted for:

* Binary files
* Encrypted files
* Unsupported formats

These display a "Preview not available" message.


### Property Inspector

Displays metadata for selected files including:

* Name
* Type
* Size

If additional metadata is not present in `data.json`, the inspector safely displays:



This ensures stability and prevents runtime errors.


## Project Structure

```
project-root/
│
├── index.html
├── styles/main.css
├── src/main.js
├── data.json
└── README.md
```

### File Descriptions

| File       | Description           |
| ---------- | --------------------- |
| index.html | Application layout    |
| main.css | UI styling            |
| main.js     | Application logic     |
| data.json  | File system data      |
| README.md  | Project documentation |

---

## How It Works

### 1. Fetching Data

The application loads file data using:

```javascript
fetch('data.json')
```

The data is validated before rendering.

---

### 2. Recursive Tree Rendering

Folders are rendered using recursion, allowing unlimited nesting depth.

Example structure:

```json
{
  "id": "root",
  "name": "Folder",
  "type": "folder",
  "children": []
}
```

---

### 3. State Management

Application state tracks:

* Selected file
* Preview file
* Expanded folders
* Open menus
* Delete confirmation

This ensures predictable UI behavior.

---

### 4. Event Delegation

Instead of attaching listeners to every element, events are handled at container level.

Benefits:

* Better performance
* Cleaner code
* Easier maintenance

---

## Running the Project

Because the project uses `fetch()`, it must be run using a local server.

### Option 1 — VS Code Live Server

1. Install "Live Server" extension
2. Right click `index.html`
3. Click "Open with Live Server"

---

### Option 2 — Github Pages

```Link: https://raiya-620.github.io/SecureVault_Dashboard/```


## Design File
```Link: https://www.figma.com/design/K50p82x4I4da6SGQkdnlYO/SecureVault-Dashboard---Design-Systems---UI?node-id=2-1565&t=ObgIUMZl3NZvwSyO-1```



## Assessment Requirements Covered

This project satisfies the following requirements:

* Uses Fetch API
* Uses external JSON file
* Uses recursive rendering
* Uses reusable functions
* Uses event delegation
* Handles missing data safely
* Implements accessible and structured UI

---

## Error Handling

The application safely handles:

* Missing metadata
* Unsupported preview types
* Invalid JSON
* Network failures

---

## Best Practices Used

* Separation of concerns
* Reusable functions
* Defensive programming
* Clean naming conventions
* Maintainable code structure

---

## Accessibility

Supports:

* Keyboard navigation
* ARIA roles
* Focus management

---

## Future Improvements

Possible enhancements:

* Real file content preview
* Drag and drop support
* Upload functionality
* Rename files
* Folder creation
* Backend integration

---

## Summary

SecureVault File Explorer demonstrates how to build a scalable and maintainable file explorer using Vanilla JavaScript while following modern frontend engineering best practices.

It is designed to meet assessment requirements while remaining easy to understand and extend.

---

## Author

SecureVault File Explorer — Assessment Project

---

## License

For educational use only.

