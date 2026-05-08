function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s@.-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 'just', 'it', 'its', 'this', 'that', 'these',
  'those', 'i', 'me', 'my', 'myself', 'we', 'us', 'our', 'ours',
  'you', 'your', 'yours', 'he', 'him', 'his', 'she', 'her', 'hers',
  'they', 'them', 'their', 'theirs', 'and', 'but', 'or', 'if', 'while',
  'about', 'up', 'down', 'get', 'got', 'getting', 'am', 'hi', 'hello',
  'dear', 'thanks', 'thank', 'pleased', 're', 'fw', 'fwd',
]);

class NaiveBayes {
  constructor() {
    this.categories = ['application', 'interview', 'rejection', 'offer', 'other'];
    this.priors = {};
    this.wordCounts = {};
    this.categoryTotals = {};
    this.vocabSize = 0;
    this.totalDocs = 0;

    this.categories.forEach(c => {
      this.priors[c] = 0;
      this.wordCounts[c] = {};
      this.categoryTotals[c] = 0;
    });
  }

  train(text, label) {
    if (!this.categories.includes(label)) return;
    const words = tokenize(text);
    this.totalDocs++;
    this.priors[label] = (this.priors[label] || 0) + 1;
    const seen = new Set();
    words.forEach(w => {
      if (!seen.has(w)) {
        seen.add(w);
        this.wordCounts[label][w] = (this.wordCounts[label][w] || 0) + 1;
        this.categoryTotals[label]++;
      }
      const currentVocab = Object.keys(this.wordCounts).reduce((max, c) =>
        Math.max(max, Object.keys(this.wordCounts[c]).length), 0);
      this.vocabSize = Math.max(this.vocabSize, currentVocab);
    });
  }

  classify(text) {
    const words = tokenize(text);
    if (words.length === 0) return { category: 'other', confidence: 0, scores: {} };

    const totalPriors = Object.values(this.priors).reduce((s, v) => s + v, 0);
    const vocab = Object.keys(this.wordCounts).reduce((set, c) => {
      Object.keys(this.wordCounts[c]).forEach(w => set.add(w));
      return set;
    }, new Set());
    const V = vocab.size;

    const logScores = {};
    this.categories.forEach(c => {
      const prior = Math.log((this.priors[c] || 1) / (totalPriors + this.categories.length));
      const totalWords = this.categoryTotals[c] || 0;
      let logProb = prior;
      words.forEach(w => {
        const count = this.wordCounts[c][w] || 0;
        logProb += Math.log((count + 1) / (totalWords + V));
      });
      logScores[c] = logProb;
    });

    const maxLog = Math.max(...Object.values(logScores));
    const expScores = {};
    this.categories.forEach(c => {
      expScores[c] = Math.exp(logScores[c] - maxLog);
    });
    const sumExp = Object.values(expScores).reduce((s, v) => s + v, 0);
    const probs = {};
    this.categories.forEach(c => {
      probs[c] = expScores[c] / sumExp;
    });

    const sorted = Object.entries(probs).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    const second = sorted[1];

    return {
      category: top[0],
      confidence: Math.round(top[1] * 100),
      scores: probs,
      margin: top[1] - second[1],
    };
  }
}

function generateTrainingData() {
  const news = [
    { text: 'your application has been received at', label: 'application' },
    { text: 'thank you for applying to the position', label: 'application' },
    { text: 'we received your application for the role', label: 'application' },
    { text: 'application submitted successfully', label: 'application' },
    { text: 'thank you for your application to', label: 'application' },
    { text: 'resume received for your application', label: 'application' },
    { text: 'application confirmed for position', label: 'application' },
    { text: 'candidate profile submitted for review', label: 'application' },
    { text: 'new application received from', label: 'application' },
    { text: 'thank you for submitting your resume', label: 'application' },
    { text: 'we have received your application materials', label: 'application' },
    { text: 'application status update for', label: 'application' },
    { text: 'your resume has been received by', label: 'application' },
    { text: 'application has been processed', label: 'application' },
    { text: 'confirmation of application receipt', label: 'application' },
    { text: 'we are reviewing your application for', label: 'application' },
    { text: 'application for employment received', label: 'application' },
    { text: 'thank you for your interest in the position', label: 'application' },
    { text: 'submission received for job posting', label: 'application' },
    { text: 'your profile has been received', label: 'application' },
    { text: 'we are excited to confirm your application', label: 'application' },
    { text: 'you have applied to the following position', label: 'application' },
    { text: 'application acknowledgement from', label: 'application' },
    { text: 'resume submitted to company', label: 'application' },
    { text: 'thank you for applying we will review your qualifications', label: 'application' },

    { text: 'interview invitation for the position', label: 'interview' },
    { text: 'we would like to invite you to interview', label: 'interview' },
    { text: 'schedule an interview with our team', label: 'interview' },
    { text: 'phone screen scheduled for', label: 'interview' },
    { text: 'you are invited to interview for the role', label: 'interview' },
    { text: 'technical interview scheduled', label: 'interview' },
    { text: 'onsite interview confirmation', label: 'interview' },
    { text: 'virtual interview details for', label: 'interview' },
    { text: 'interview request from hiring manager', label: 'interview' },
    { text: 'coding interview scheduled for', label: 'interview' },
    { text: 'we would like to meet you for an interview', label: 'interview' },
    { text: 'next steps phone screen invitation', label: 'interview' },
    { text: 'interview confirmation for position', label: 'interview' },
    { text: 'come meet the team interview invitation', label: 'interview' },
    { text: 'schedule a time to interview with', label: 'interview' },
    { text: 'we would like to schedule a phone interview', label: 'interview' },
    { text: 'interview scheduling request from', label: 'interview' },
    { text: 'you have been selected for an interview', label: 'interview' },
    { text: 'we are impressed with your background interview', label: 'interview' },
    { text: 'interview availability please pick a time', label: 'interview' },
    { text: 'technical screen invitation from', label: 'interview' },
    { text: 'we want to chat with you interview', label: 'interview' },
    { text: 'invitation to complete coding challenge interview', label: 'interview' },
    { text: 'behavioral interview scheduled for', label: 'interview' },
    { text: 'panel interview scheduled date', label: 'interview' },

    { text: 'thank you for your interest we have decided to move forward', label: 'rejection' },
    { text: 'unfortunately we will not be moving forward', label: 'rejection' },
    { text: 'after careful consideration we have decided to pursue other candidates', label: 'rejection' },
    { text: 'update on your application status', label: 'rejection' },
    { text: 'we regret to inform you that we have decided to move forward', label: 'rejection' },
    { text: 'not moving forward with your application', label: 'rejection' },
    { text: 'the position has been filled we cannot consider', label: 'rejection' },
    { text: 'we decided to move forward with other candidates', label: 'rejection' },
    { text: 'we will not be moving forward with your candidacy', label: 'rejection' },
    { text: 'while your background is impressive we have decided', label: 'rejection' },
    { text: 'we are writing to let you know that we have decided', label: 'rejection' },
    { text: 'we have chosen to move forward with another candidate', label: 'rejection' },
    { text: 'unable to offer you a position at this time', label: 'rejection' },
    { text: 'your application was not selected for further consideration', label: 'rejection' },
    { text: 'we appreciate your interest but have decided to go in another direction', label: 'rejection' },
    { text: 'we have decided not to proceed with your application', label: 'rejection' },
    { text: 'we have filled the position and will not be considering', label: 'rejection' },
    { text: 'we regret to inform you that your application has not been successful', label: 'rejection' },
    { text: 'after reviewing your application we have decided', label: 'rejection' },
    { text: 'unfortunately we have decided to move forward with other applicants', label: 'rejection' },
    { text: 'we have decided to pursue other candidates for this role', label: 'rejection' },
    { text: 'your candidacy will not be moving forward', label: 'rejection' },
    { text: 'while we were impressed by your qualifications we have chosen', label: 'rejection' },
    { text: 'we have decided to close the position', label: 'rejection' },
    { text: 'thank you for your time but we have decided', label: 'rejection' },
    { text: 'thank you for your interest in the position unfortunately we have decided', label: 'rejection' },
    { text: 'thank you for your interest update on your application status we have decided', label: 'rejection' },
    { text: 'we appreciate your interest in the role but have chosen to move forward', label: 'rejection' },
    { text: 'thank you for your application we regret to inform you', label: 'rejection' },
    { text: 'your application at company status update we have decided', label: 'rejection' },
    { text: 'application status update we have decided not to proceed', label: 'rejection' },
    { text: 'we appreciate your interest in the position unfortunately we will not', label: 'rejection' },

    { text: 'job offer for the position of', label: 'offer' },
    { text: 'we are pleased to offer you the position', label: 'offer' },
    { text: 'offer letter attached for your review', label: 'offer' },
    { text: 'congratulations we are excited to offer you', label: 'offer' },
    { text: 'compensation details for your new role', label: 'offer' },
    { text: 'welcome to the team employment offer', label: 'offer' },
    { text: 'formal offer of employment from', label: 'offer' },
    { text: 'we are delighted to extend an offer', label: 'offer' },
    { text: 'offer package details for your review', label: 'offer' },
    { text: 'employment offer agreement enclosed', label: 'offer' },
    { text: 'congratulations on your new position offer', label: 'offer' },
    { text: 'start date and compensation details', label: 'offer' },
    { text: 'we would like to welcome you to the team offer', label: 'offer' },
    { text: 'offer of employment terms and conditions', label: 'offer' },
    { text: 'you have been selected for the position offer', label: 'offer' },
    { text: 'pleased to inform you that we are offering', label: 'offer' },
    { text: 'acceptance of your offer of employment', label: 'offer' },
    { text: 'salary offer and benefits package', label: 'offer' },
    { text: 'we are happy to extend this offer of employment', label: 'offer' },
    { text: 'offer details compensation start date', label: 'offer' },
    { text: 'congratulations you have been selected for the role', label: 'offer' },
    { text: 'equity compensation offer details', label: 'offer' },
    { text: 'welcome aboard employment offer letter', label: 'offer' },
    { text: 'offer acceptance deadline information', label: 'offer' },
    { text: 'we look forward to welcoming you to the team offer', label: 'offer' },

    { text: 'your monthly newsletter is ready', label: 'other' },
    { text: 'password reset request for your account', label: 'other' },
    { text: 'you have a new notification from', label: 'other' },
    { text: 'weekly digest of your activity', label: 'other' },
    { text: 'your bill is ready for this month', label: 'other' },
    { text: 'new login from unknown device', label: 'other' },
    { text: 'please update your payment information', label: 'other' },
    { text: 'your order has been shipped', label: 'other' },
    { text: 'new message from your connection', label: 'other' },
    { text: 'security alert for your account', label: 'other' },
    { text: 'your subscription is expiring soon', label: 'other' },
    { text: 'someone liked your post', label: 'other' },
    { text: 'weekly report is now available', label: 'other' },
    { text: 'please verify your email address', label: 'other' },
    { text: 'your account has been updated', label: 'other' },
    { text: 'new comment on your article', label: 'other' },
    { text: 'your package has been delivered', label: 'other' },
    { text: 'two factor authentication code', label: 'other' },
    { text: 'receipt for your recent purchase', label: 'other' },
    { text: 'you have been mentioned in a post', label: 'other' },
    { text: 'renew your subscription now', label: 'other' },
    { text: 'new event invitation from', label: 'other' },
    { text: 'your refund has been processed', label: 'other' },
    { text: 'changes to our terms of service', label: 'other' },
    { text: 'your support ticket has been updated', label: 'other' },
    { text: 'application has crashed error report', label: 'other' },
    { text: 'status update your server is running', label: 'other' },
    { text: 'your application version has been updated to', label: 'other' },
    { text: 'status of your order has been updated', label: 'other' },
    { text: 'new app version available for download', label: 'other' },
  ];

  const senders = [
    'noreply@lever.co', 'careers@greenhouse.io', 'jobs@workable.com',
    'apply@bamboohr.com', 'notifications@linkedin.com', 'alerts@indeed.com',
    'careers@acmecorp.com', 'jobs@techstartup.io', 'recruiting@bigcompany.com',
    'hr@company.com', 'talent@startup.com', 'careers@enterprise.com',
    'noreply@mail.google.com', 'updates@newsletter.com', 'alert@notify.com',
    'support@shop.com', 'info@service.com', 'team@platform.com',
  ];

  const trainingData = [];
  news.forEach(n => {
    senders.slice(0, 6).forEach(s => {
      trainingData.push({ text: `${n.text} ${s.split('@')[1] || ''} ${s}`, label: n.label });
    });
  });
  return trainingData;
}

const model = new NaiveBayes();
const trainingData = generateTrainingData();
trainingData.forEach(d => model.train(d.text, d.label));

function classifyJobEmail(subject, sender, snippet) {
  const text = `${subject || ''} ${sender || ''} ${snippet || ''}`;
  const result = model.classify(text);

  if (result.category === 'other' || result.confidence < 50) {
    return null;
  }

  return {
    category: result.category,
    confidence: result.confidence,
    scores: result.scores,
    margin: result.margin,
  };
}

module.exports = { classifyJobEmail, NaiveBayes, model };
