const LogisticRegression = require('natural/lib/natural/classifiers/logistic_regression_classifier');
const PorterStemmer = require('natural/lib/natural/stemmers/porter_stemmer');
const { WordTokenizer } = require('natural/lib/natural/tokenizers');
const path = require('path');
const fs = require('fs');

const tokenizer = new WordTokenizer();

const customStemmer = {
  tokenizeAndStem(text) {
    return tokenizer.tokenize((text || '').toLowerCase())
      .filter(t => t.length > 2)
      .map(t => PorterStemmer.stem(t));
  }
};

const TRAINING_DIR = path.join(__dirname, 'training-data');

function loadTrainingData(filename) {
  const filePath = path.join(TRAINING_DIR, filename);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return {};
}

function createClassifierFromJson(filename) {
  const c = new LogisticRegression(customStemmer);
  const data = loadTrainingData(filename);
  Object.entries(data).forEach(([label, texts]) => {
    texts.forEach(t => c.addDocument(t, label));
  });
  c.train();
  return c;
}

function retrainClassifier(filename) {
  const c = new LogisticRegression(customStemmer);
  const data = loadTrainingData(filename);
  Object.entries(data).forEach(([label, texts]) => {
    texts.forEach(t => c.addDocument(t, label));
  });
  c.train();
  return c;
}

function saveTrainingData(filename, data) {
  const filePath = path.join(TRAINING_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

let emailCategoryClassifier = createClassifierFromJson('email-categories.json');
let intentClassifier = createClassifierFromJson('intents.json');
let jobEmailClassifier = createClassifierFromJson('job-emails.json');

function reloadAllClassifiers() {
  emailCategoryClassifier = retrainClassifier('email-categories.json');
  intentClassifier = retrainClassifier('intents.json');
  jobEmailClassifier = retrainClassifier('job-emails.json');
}

function classifyEmailCategory(subject, sender) {
  const text = `${subject || ''} ${sender || ''}`.toLowerCase().replace(/<[^>]+>/g, ' ').trim();
  if (!text) return { category: 'other', confidence: 0, scores: {} };

  const classifications = emailCategoryClassifier.getClassifications(text);
  const top = classifications[0];
  const scores = {};
  classifications.forEach(c => { scores[c.label] = Math.round(c.value * 100); });

  return {
    category: top.label,
    confidence: Math.round(top.value * 100),
    scores,
  };
}

function classifyIntent(prompt) {
  const text = (prompt || '').toLowerCase().trim();
  if (!text) return { intent: 'general', confidence: 0, scores: {} };

  const classifications = intentClassifier.getClassifications(text);
  const top = classifications[0];
  const scores = {};
  classifications.forEach(c => { scores[c.label] = Math.round(c.value * 100); });

  const confidence = Math.round(top.value * 100);

  if (confidence < 65) {
    return { intent: 'general', confidence, scores };
  }

  return {
    intent: top.label,
    confidence,
    scores,
  };
}

function classifyJobEmail(subject, sender, snippet) {
  const text = `${subject || ''} ${sender || ''} ${snippet || ''}`.toLowerCase().replace(/<[^>]+>/g, ' ').trim();
  if (!text) return null;

  const classifications = jobEmailClassifier.getClassifications(text);
  const top = classifications[0];
  const scores = {};
  classifications.forEach(c => { scores[c.label] = Math.round(c.value * 100); });

  if (top.label === 'other' || Math.round(top.value * 100) < 60) {
    return null;
  }

  return {
    category: top.label,
    confidence: Math.round(top.value * 100),
    scores,
    margin: top.value - classifications[1].value,
  };
}

function classifyJobEmails(emails) {
  if (!emails || emails.length === 0) return [];

  const results = [];

  emails.forEach(email => {
    const result = classifyJobEmail(email.subject, email.sender, email.snippet);
    if (result) {
      results.push({
        emailId: email.id,
        subject: email.subject,
        sender: email.sender,
        snippet: email.snippet,
        date: email.internal_date,
        category: result.category,
        confidence: result.confidence,
        scores: result.scores,
      });
    }
  });

  results.sort((a, b) => b.confidence - a.confidence);

  const seen = new Set();
  const deduped = [];
  results.forEach(r => {
    const key = (r.subject || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(r);
    }
  });

  return deduped;
}

module.exports = {
  classifyEmailCategory,
  classifyIntent,
  classifyJobEmail,
  classifyJobEmails,
  reloadAllClassifiers,
  loadTrainingData,
  saveTrainingData,
  retrainClassifier,
};
