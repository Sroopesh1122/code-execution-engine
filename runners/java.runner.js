const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { v4: uuidv4 } = require("uuid");

module.exports = async (studentCode, visibleTests, hiddenTests) => {
  const tempDir = `/tmp/java_${uuidv4()}`;
  fs.mkdirSync(tempDir);

  const filePath = path.join(tempDir, "Solution.java");
  fs.writeFileSync(filePath, studentCode);

  try {
    execSync(`javac ${filePath}`, { timeout: 5000 });
  } catch (compileErr) {
    return { compilationError: compileErr.message, results: null, score: 0 };
  }

  const results = { visible: [], hidden: [] };
  let passedVisible = 0;
  let passedHidden = 0;

  const execTest = (input) => {
    try {
      const cmd = `java -cp ${tempDir} Solution ${input}`;
      const output = execSync(cmd, { timeout: 3000 }).toString().trim();
      return { output, error: null };
    } catch (err) {
      return { output: null, error: err.message };
    }
  };

  for (const t of visibleTests) {
    const { output, error } = execTest(t.input);
    const ok = !error && output === t.output;
    if (ok) passedVisible++;
    results.visible.push({ input: t.input, output, expected: t.output, ok, error });
  }

  for (const t of hiddenTests) {
    const { output, error } = execTest(t.input);
    const ok = !error && output === t.output;
    if (ok) passedHidden++;
    results.hidden.push({ input: t.input, output, expected: t.output, ok, error });
  }

  return {
    compilationError: null,
    results,
    passedVisible,
    passedHidden,
    totalVisible: visibleTests.length,
    totalHidden: hiddenTests.length,
    score: passedVisible + passedHidden
  };
};
