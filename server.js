const express = require("express");
const bodyParser = require("body-parser");
const runPython = require("./runners/python.runner");
const runJava = require("./runners/java.runner");
const runC = require("./runners/c.runner");

const app = express();
app.use(bodyParser.json());

app.post("/execute", async (req, res) => {
  const { language, studentCode, visibleTests, hiddenTests } = req.body;

  try {
    let result;

    if (language === "python") result = await runPython(studentCode, visibleTests, hiddenTests);
    else if (language === "java") result = await runJava(studentCode, visibleTests, hiddenTests);
    else if (language === "c") result = await runC(studentCode, visibleTests, hiddenTests);
    else return res.status(400).json({ success: false, error: "Unsupported language" });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(3000, () => console.log("Code execution service running on port 3000"));
