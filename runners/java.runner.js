const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { v4: uuidv4 } = require("uuid");

module.exports = async (studentCode, visibleTests, hiddenTests) => {
  // 1️⃣ Create temporary directory
  const tempDir = `/tmp/java_${uuidv4()}`;
  fs.mkdirSync(tempDir, { recursive: true });

  // 2️⃣ Write student Solution.java
  const solutionPath = path.join(tempDir, "Solution.java");
  fs.writeFileSync(solutionPath, studentCode);

  // 3️⃣ Create wrapper Main.java to call student solution
  const mainPath = path.join(tempDir, "Main.java");
  const mainCode = `
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        try {
            Scanner sc = new Scanner(System.in);
            String line = sc.nextLine();
            sc.close();
            
            // assuming input is integer for simplicity
            int input = Integer.parseInt(line.trim());
            System.out.println(Solution.solution(input));
        } catch (Exception e) {
            System.out.println("RuntimeError: " + e.getMessage());
        }
    }
}
`;
  fs.writeFileSync(mainPath, mainCode);

  // 4️⃣ Compile both files
  try {
    execSync(`javac ${solutionPath} ${mainPath}`, { timeout: 5000 });
  } catch (compileErr) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    return {
      compilationError: compileErr.message,
      results: null,
      score: 0
    };
  }

  // 5️⃣ Function to run tests
  const runTest = (input) => {
    try {
      const cmd = `java -cp ${tempDir} Main`;
      const output = execSync(cmd, {
        input: input.toString(),
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe']
      }).toString().trim();
      return { output, error: null };
    } catch (err) {
      return { output: null, error: err.message };
    }
  };

  const results = { visible: [], hidden: [] };
  let passedVisible = 0;
  let passedHidden = 0;

  // 6️⃣ Run visible tests
  for (const t of visibleTests) {
    const { output, error } = runTest(t.input);
    const ok = !error && output === t.output;
    if (ok) passedVisible++;
    results.visible.push({
      input: t.input,
      output,
      expected: t.output,
      ok,
      error
    });
  }

  // 7️⃣ Run hidden tests
  for (const t of hiddenTests) {
    const { output, error } = runTest(t.input);
    const ok = !error && output === t.output;
    if (ok) passedHidden++;
    results.hidden.push({
      input: t.input,
      output,
      expected: t.output,
      ok,
      error
    });
  }

  // 8️⃣ Cleanup temp directory
  fs.rmSync(tempDir, { recursive: true, force: true });

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
