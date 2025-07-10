# Simple Notes

A simple, self-hosted, and encrypted note-taking web app. Built with Node.js, it provides a clean and modern interface to keep your thoughts and files secure.

-----

## About The Project

Simple Notes is a web-based application built with Node.js and Express that allows you to securely save your notes and files. With a focus on simplicity and privacy, all your data is encrypted, giving you full control and peace of mind. The interface is designed to be minimal and intuitive, allowing you to focus on what matters most: your notes.

Whether you need to jot down a quick thought, write a detailed note with formatted text, or securely store a sensitive file, Simple Notes is the perfect tool for the job.

-----

## ✨ Features

  * 🔐 **Encrypted Storage**: All your notes and attachments are encrypted before being saved, ensuring your data remains private.
  * 💻 **Clean and Modern UI**: A beautiful and simple interface that gets out of your way.
  * 🎨 **Light & Dark Themes**: Switch between light and dark mode for your viewing comfort.
  * 📎 **File Attachments**: Securely attach any file to your notes.
  * ✍️ **Markdown Syntax Helper**: A quick guide for formatting your text with headers, bold, italics, strikethrough, and code blocks.
  * 📝 **Full Note Management**: Easily create, edit, and delete your notes.
  * 🚀 **Self-Hosted**: You have full control over your data on your own server.

-----

## 🛠️ How It Works

Simple Notes runs on a lightweight **Node.js** and **Express** backend.

  * **Notes** are stored in a local **SQLite** database.
  * **File attachments** are saved in a dedicated folder on the server's file system.

All content, whether in the database or in the attachments folder, is encrypted to ensure maximum privacy.

-----

## 🚀 Getting Started

You can get your own instance of Simple Notes up and running in minutes. Choose one of the two methods below.

### Using Docker (Recommended)

This is the simplest way to get started. All you need is Docker installed on your machine.

Run the following command in your terminal:

```
docker run -d -p 3000:3000 --name=simple-notes --restart unless-stopped bartche/simple-notes
```

### From Source

If you prefer to run the application from the source code, follow these steps:

1.  **Clone the repository:**

    ```
    git clone https://github.com/bartche/simple-notes.git
    ```

2.  **Navigate to the project directory:**

    ```
    cd simple-notes
    ```

3.  **Install the dependencies:**

    ```
    npm install
    ```

4.  **Start the server:**

    ```
    node server.js
    ```

-----

## USAGE

Once the application is running (either via Docker or from source), open your web browser and navigate to:

**http://localhost:3000**

## DISCLAIMER

Majorly written by AI.
