async function analyzeEmails(prompt, emails) {
  if (prompt) {
    return analyzeWithPrompt(prompt, emails);
  }
  return generateDefaultAnalysis(emails);
}

function generateDefaultAnalysis(emails) {
  if (!emails || emails.length === 0) {
    return {
      summary: 'No emails available for analysis.',
      insights: [],
      categories: [],
    };
  }

  const totalEmails = emails.length;
  const senders = emails.map((e) => e.sender).filter(Boolean);
  const uniqueSenders = new Set(senders).size;

  const subjects = emails.map((e) => e.subject).filter(Boolean);
  const avgSubjectLength = subjects.reduce((sum, s) => sum + s.length, 0) / subjects.length;

  const categories = classifyEmails(emails);
  const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];

  const insights = [
    `You have received ${totalEmails} emails in the analyzed period.`,
    `Emails came from ${uniqueSenders} unique senders.`,
    `Average subject line length is ${Math.round(avgSubjectLength)} characters.`,
    `Most common category: ${topCategory[0]} (${topCategory[1]} emails)`,
  ];

  const senderCounts = {};
  senders.forEach((sender) => {
    senderCounts[sender] = (senderCounts[sender] || 0) + 1;
  });

  const topSenders = Object.entries(senderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sender, count]) => ({ sender, count }));

  return {
    summary: `Analysis of ${totalEmails} emails from ${uniqueSenders} senders.`,
    insights,
    topSenders,
    categories,
  };
}

function classifyEmails(emails) {
  const categories = {
    newsletters: 0,
    notifications: 0,
    personal: 0,
    work: 0,
    other: 0,
  };

  emails.forEach((email) => {
    const subject = (email.subject || '').toLowerCase();
    const sender = (email.sender || '').toLowerCase();

    if (
      subject.includes('newsletter') ||
      sender.includes('noreply') ||
      sender.includes('no-reply')
    ) {
      categories.newsletters++;
    } else if (
      subject.includes('alert') ||
      subject.includes('notification') ||
      subject.includes('update')
    ) {
      categories.notifications++;
    } else if (
      sender.includes('@gmail.com') ||
      sender.includes('@yahoo.com') ||
      sender.includes('@outlook.com')
    ) {
      categories.personal++;
    } else if (
      sender.includes('.com') &&
      !sender.includes('@gmail.com') &&
      !sender.includes('@yahoo.com')
    ) {
      categories.work++;
    } else {
      categories.other++;
    }
  });

  return categories;
}

function analyzeWithPrompt(prompt, emails) {
  const lowerPrompt = prompt.toLowerCase();
  const results = [];

  if (lowerPrompt.includes('most emails') || lowerPrompt.includes('top sender')) {
    const senderCounts = {};
    emails.forEach((email) => {
      const sender = email.sender || 'Unknown';
      const clean = sender.match(/<(.+)>/)?.[1] || sender;
      senderCounts[clean] = (senderCounts[clean] || 0) + 1;
    });

    const topSenders = Object.entries(senderCounts).sort((a, b) => b[1] - a[1]).slice(0, 3);
    topSenders.forEach(([sender, count], i) => {
      results.push(`${i + 1}. ${sender} - ${count} emails`);
    });
  }

  if (lowerPrompt.includes('newsletter')) {
    const newsletters = emails.filter((e) => {
      const subject = (e.subject || '').toLowerCase();
      const sender = (e.sender || '').toLowerCase();
      return subject.includes('newsletter') || sender.includes('noreply') || sender.includes('no-reply');
    });
    const percentage = emails.length > 0 ? ((newsletters.length / emails.length) * 100).toFixed(1) : 0;
    results.push(`You have ${newsletters.length} newsletters (${percentage}% of total emails).`);
  }

  if (lowerPrompt.includes('unread') || lowerPrompt.includes('important')) {
    const importantEmails = emails.filter(
      (e) => e.labels && e.labels.includes('IMPORTANT')
    );
    results.push(`You have ${importantEmails.length} important emails.`);
  }

  if (lowerPrompt.includes('recent') || lowerPrompt.includes('latest')) {
    const sorted = [...emails].sort(
      (a, b) => (b.internalDate || 0) - (a.internalDate || 0)
    );
    const recent = sorted.slice(0, 5);
    results.push('Recent emails:');
    recent.forEach((e, i) => {
      const date = e.internalDate ? new Date(e.internalDate).toLocaleDateString() : 'Unknown date';
      results.push(`${i + 1}. "${e.subject}" (${date})`);
    });
  }

  if (lowerPrompt.includes('pattern') || lowerPrompt.includes('weekly') || lowerPrompt.includes('day of week')) {
    const dayCounts = { Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0 };
    emails.forEach((email) => {
      if (email.internalDate) {
        const date = new Date(email.internalDate);
        const day = date.toLocaleDateString('en-US', { weekday: 'long' });
        dayCounts[day]++;
      }
    });

    const sortedDays = Object.entries(dayCounts).sort((a, b) => b[1] - a[1]);
    results.push('Email volume by day of week:');
    sortedDays.forEach(([day, count]) => {
      results.push(`  ${day}: ${count} emails`);
    });
    results.push(`Busiest day: ${sortedDays[0][0]} (${sortedDays[0][1]} emails)`);
  }

  if (lowerPrompt.includes('category') || lowerPrompt.includes('type')) {
    const categories = classifyEmails(emails);
    results.push('Email breakdown by category:');
    Object.entries(categories).forEach(([cat, count]) => {
      const percentage = emails.length > 0 ? ((count / emails.length) * 100).toFixed(1) : 0;
      results.push(`  ${cat}: ${count} (${percentage}%)`);
    });
  }

  if (results.length === 0) {
    results.push(
      `I analyzed ${emails.length} emails. Try asking about: top senders, newsletters, recent emails, weekly patterns, or email categories.`
    );
  }

  return {
    prompt,
    results,
  };
}

module.exports = { analyzeEmails };
