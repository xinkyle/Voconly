use std::collections::BTreeMap;

#[derive(Default)]
pub(super) struct OrderedFinalText {
    next_index: u32,
    pending: BTreeMap<u32, String>,
    text: String,
}

impl OrderedFinalText {
    pub(super) fn commit(&mut self, index: u32, text: String) -> Option<&str> {
        if index < self.next_index {
            return None;
        }

        self.pending.entry(index).or_insert(text);
        let previous_len = self.text.len();
        while let Some(segment) = self.pending.remove(&self.next_index) {
            self.next_index += 1;
            if !segment.is_empty() {
                if !self.text.is_empty() {
                    self.text.push(' ');
                }
                self.text.push_str(&segment);
            }
        }
        (self.text.len() > previous_len).then_some(self.text.as_str())
    }

    pub(super) fn text(&self) -> &str {
        &self.text
    }
}

#[cfg(test)]
mod tests {
    use super::OrderedFinalText;

    #[test]
    fn commits_only_contiguous_final_segments() {
        let mut transcript = OrderedFinalText::default();

        assert_eq!(transcript.commit(1, "第二段".into()), None);
        assert_eq!(transcript.commit(0, "第一段".into()), Some("第一段 第二段"));
        assert_eq!(transcript.commit(0, "旧结果".into()), None);
        assert_eq!(transcript.text(), "第一段 第二段");
    }

    #[test]
    fn empty_segments_advance_without_inserting_a_separator() {
        let mut transcript = OrderedFinalText::default();

        assert_eq!(transcript.commit(0, "first".into()), Some("first"));
        assert_eq!(transcript.commit(2, "last".into()), None);
        assert_eq!(transcript.commit(1, String::new()), Some("first last"));
        assert_eq!(transcript.commit(3, String::new()), None);
        assert_eq!(transcript.text(), "first last");
    }
}
