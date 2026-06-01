const assert = require('assert');
const path = require('path');

// Mock electron app for DB tests
process.env.GOOGLE_CLIENT_ID = 'test';
process.env.GOOGLE_CLIENT_SECRET = 'test';

// Override app path for testing
const originalAppPath = require('electron')?.app?.getPath;
// We'll test ML only since DB requires electron

const ml = require('../src/ml/index');

function testEmailCategoryClassification() {
  console.log('  Testing email category classification...');

  const newsletter = ml.classifyEmailCategory('Your monthly newsletter is ready', 'newsletter@mailchimp.com');
  assert.strictEqual(newsletter.category, 'newsletter', `Expected newsletter, got ${newsletter.category}`);
  assert.ok(newsletter.confidence >= 50, `Low confidence: ${newsletter.confidence}`);
  console.log(`    ✓ Newsletter: ${newsletter.category} (${newsletter.confidence}%)`);

  const notification = ml.classifyEmailCategory('Password reset request', 'noreply@google.com');
  assert.strictEqual(notification.category, 'notification', `Expected notification, got ${notification.category}`);
  console.log(`    ✓ Notification: ${notification.category} (${notification.confidence}%)`);

  const personal = ml.classifyEmailCategory('Hey how are you doing', 'friend@gmail.com');
  assert.strictEqual(personal.category, 'personal', `Expected personal, got ${personal.category}`);
  console.log(`    ✓ Personal: ${personal.category} (${personal.confidence}%)`);

  const work = ml.classifyEmailCategory('Meeting scheduled for tomorrow', 'meeting@company.com');
  assert.strictEqual(work.category, 'work', `Expected work, got ${work.category}`);
  console.log(`    ✓ Work: ${work.category} (${work.confidence}%)`);

  const other = ml.classifyEmailCategory('Your order has been shipped', 'noreply@amazon.com');
  assert.strictEqual(other.category, 'other', `Expected other, got ${other.category}`);
  console.log(`    ✓ Other: ${other.category} (${other.confidence}%)`);

  console.log('  ✓ Email category classification passed');
}

function testIntentClassification() {
  console.log('  Testing intent classification...');

  const topSender = ml.classifyIntent('who emails me the most');
  assert.strictEqual(topSender.intent, 'top_sender', `Expected top_sender, got ${topSender.intent}`);
  assert.ok(topSender.confidence >= 65, `Low confidence: ${topSender.confidence}`);
  console.log(`    ✓ Top sender: ${topSender.intent} (${topSender.confidence}%)`);

  const newsletterIntent = ml.classifyIntent('how many newsletters do i have');
  assert.strictEqual(newsletterIntent.intent, 'newsletter');
  console.log(`    ✓ Newsletter intent: ${newsletterIntent.intent} (${newsletterIntent.confidence}%)`);

  const recent = ml.classifyIntent('show recent emails');
  assert.strictEqual(recent.intent, 'recent');
  console.log(`    ✓ Recent: ${recent.intent} (${recent.confidence}%)`);

  const pattern = ml.classifyIntent('what day do i get most emails');
  assert.strictEqual(pattern.intent, 'pattern');
  console.log(`    ✓ Pattern: ${pattern.intent} (${pattern.confidence}%)`);

  const category = ml.classifyIntent('email types in my inbox');
  assert.strictEqual(category.intent, 'category');
  console.log(`    ✓ Category: ${category.intent} (${category.confidence}%)`);

  // General fallback for ambiguous queries
  const general = ml.classifyIntent('hello how are you');
  assert.strictEqual(general.intent, 'general');
  console.log(`    ✓ General fallback: ${general.intent} (${general.confidence}%)`);

  console.log('  ✓ Intent classification passed');
}

function testJobEmailClassification() {
  console.log('  Testing job email classification...');

  const app = ml.classifyJobEmail('Your application has been received', 'noreply@lever.co', 'Thank you for applying');
  assert.ok(app !== null, 'Should classify application email');
  if (app) {
    assert.strictEqual(app.category, 'application');
    console.log(`    ✓ Application: ${app.category} (${app.confidence}%)`);
  }

  const interview = ml.classifyJobEmail('Interview invitation', 'careers@greenhouse.io', 'We would like to invite you');
  assert.ok(interview !== null, 'Should classify interview email');
  if (interview) {
    assert.strictEqual(interview.category, 'interview');
    console.log(`    ✓ Interview: ${interview.category} (${interview.confidence}%)`);
  }

  const rejection = ml.classifyJobEmail('Update on your application', 'noreply@lever.co', 'We have decided to move forward');
  assert.ok(rejection !== null, 'Should classify rejection email');
  if (rejection) {
    assert.strictEqual(rejection.category, 'rejection');
    console.log(`    ✓ Rejection: ${rejection.category} (${rejection.confidence}%)`);
  }

  const offer = ml.classifyJobEmail('Job offer for the position', 'careers@greenhouse.io', 'We are pleased to offer');
  assert.ok(offer !== null, 'Should classify offer email');
  if (offer) {
    assert.strictEqual(offer.category, 'offer');
    console.log(`    ✓ Offer: ${offer.category} (${offer.confidence}%)`);
  }

  const other = ml.classifyJobEmail('Your monthly newsletter', 'noreply@mailchimp.com', 'Newsletter content');
  assert.strictEqual(other, null, 'Should return null for non-job emails');
  console.log(`    ✓ Non-job email correctly returns null`);

  console.log('  ✓ Job email classification passed');
}

function testBatchJobClassification() {
  console.log('  Testing batch job classification...');

  const emails = [
    { id: '1', subject: 'Your application received', sender: 'noreply@lever.co', snippet: 'Thank you for your interest', internal_date: Date.now() },
    { id: '2', subject: 'Interview invitation', sender: 'careers@greenhouse.io', snippet: 'We would like to meet you', internal_date: Date.now() },
    { id: '3', subject: 'Password reset', sender: 'noreply@google.com', snippet: 'Click to reset password', internal_date: Date.now() },
    { id: '4', subject: 'Order shipped', sender: 'noreply@amazon.com', snippet: 'Your package is on its way', internal_date: Date.now() },
  ];

  const results = ml.classifyJobEmails(emails);
  assert.ok(results.length <= 2, `Expected at most 2 job results, got ${results.length}`);
  console.log(`    ✓ Batch classified ${results.length} job emails from ${emails.length} total`);
}

function testEmptyInputs() {
  console.log('  Testing empty inputs...');

  const emptyCat = ml.classifyEmailCategory('', '');
  assert.strictEqual(emptyCat.category, 'other');
  assert.strictEqual(emptyCat.confidence, 0);

  const emptyIntent = ml.classifyIntent('');
  assert.strictEqual(emptyIntent.intent, 'general');

  const emptyJob = ml.classifyJobEmail('', '', '');
  assert.strictEqual(emptyJob, null);

  const emptyBatch = ml.classifyJobEmails([]);
  assert.deepStrictEqual(emptyBatch, []);

  console.log('  ✓ Empty input handling passed');
}

function testTrainingDataReload() {
  console.log('  Testing training data reload...');

  // Save original data
  const emailData = ml.loadTrainingData('email-categories.json');
  assert.ok(emailData.newsletter, 'Should have newsletter category');
  assert.ok(emailData.notification, 'Should have notification category');

  const intentData = ml.loadTrainingData('intents.json');
  assert.ok(intentData.top_sender, 'Should have top_sender intent');

  const jobData = ml.loadTrainingData('job-emails.json');
  assert.ok(jobData.application, 'Should have application category');

  console.log(`    ✓ Email categories: ${Object.keys(emailData).length}`);
  console.log(`    ✓ Intents: ${Object.keys(intentData).length}`);
  console.log(`    ✓ Job email categories: ${Object.keys(jobData).length}`);

  // Test reload
  ml.reloadAllClassifiers();
  const result = ml.classifyEmailCategory('Your monthly newsletter', 'noreply@mailchimp.com');
  assert.strictEqual(result.category, 'newsletter');
  console.log('  ✓ Training data reload passed');
}

function runAll() {
  console.log('\n🧪 ML Module Tests\n');

  const tests = [
    testEmailCategoryClassification,
    testIntentClassification,
    testJobEmailClassification,
    testBatchJobClassification,
    testEmptyInputs,
    testTrainingDataReload,
  ];

  let passed = 0;
  let failed = 0;

  tests.forEach(test => {
    try {
      test();
      passed++;
    } catch (err) {
      console.log(`  ✗ ${test.name}: FAILED`);
      console.log(`    ${err.message}`);
      failed++;
    }
    console.log('');
  });

  console.log(`Results: ${passed} passed, ${failed} failed, ${tests.length} total\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runAll();
