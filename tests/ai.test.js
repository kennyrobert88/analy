const assert = require('assert');

const { analyzeJobApplications, classifyJobEmails } = require('../src/ai/index');

function testAnalyzeJobApplications() {
  console.log('  Testing analyzeJobApplications...');

  // Empty
  const empty = analyzeJobApplications([]);
  assert.strictEqual(empty.stats.total, 0);
  assert.ok(empty.insights.length === 0);
  console.log('    ✓ Empty applications handled');

  // Single application
  const single = analyzeJobApplications([{ status: 'applied', job_title: 'Engineer', company_name: 'Co' }]);
  assert.strictEqual(single.stats.total, 1);
  assert.strictEqual(single.stats.applied, 1);
  console.log('    ✓ Single application analyzed');

  // Multiple statuses
  const apps = [
    { status: 'applied' }, { status: 'interview' }, { status: 'interview' },
    { status: 'rejected' }, { status: 'accepted' },
  ];
  const multi = analyzeJobApplications(apps);
  assert.strictEqual(multi.stats.total, 5);
  assert.strictEqual(multi.stats.applied, 1);
  assert.strictEqual(multi.stats.interview, 2);
  assert.strictEqual(multi.stats.rejected, 1);
  assert.strictEqual(multi.stats.accepted, 1);
  assert.ok(multi.insights.length >= 4);
  console.log('    ✓ Multiple statuses counted correctly');

  // Interview rate
  assert.ok(multi.insights.some(i => i.includes('40.0%')));
  console.log('    ✓ Interview rate calculated');

  console.log('  ✓ analyzeJobApplications passed');
}

function testClassifyJobEmails() {
  console.log('  Testing classifyJobEmails (delegates to ML)...');

  const emails = [
    { id: '1', subject: 'Your application has been received', sender: 'noreply@lever.co', snippet: 'Thank you for applying', internal_date: Date.now() },
    { id: '2', subject: 'Newsletter', sender: 'noreply@mailchimp.com', snippet: 'Monthly update', internal_date: Date.now() },
  ];

  const results = classifyJobEmails(emails);
  assert.ok(Array.isArray(results));
  console.log(`    ✓ Classified ${results.length} job emails`);

  console.log('  ✓ classifyJobEmails passed');
}

function run() {
  console.log('\n🧪 AI Module Tests\n');

  const tests = [testAnalyzeJobApplications, testClassifyJobEmails];
  let passed = 0, failed = 0;

  tests.forEach(t => {
    try { t(); passed++; } catch (err) { console.log(`  ✗ ${t.name}: ${err.message}`); failed++; }
    console.log('');
  });

  console.log(`Results: ${passed} passed, ${failed} failed, ${tests.length} total\n`);
  if (failed > 0) process.exit(1);
}

run();
