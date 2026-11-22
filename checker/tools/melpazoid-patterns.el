;;; melpazoid-patterns.el --- Export melpazoid's pattern checks as JSON  -*- lexical-binding: t; -*-

;;; Commentary:

;; Usage: emacs --batch -l melpazoid-patterns.el MELPAZOID-EL OUTPUT-JSON
;; Reads melpazoid.el without loading it, evaluates the checkers whose bodies
;; are calls to `melpazoid-misc', and records each call's arguments.

;;; Code:

(require 'cl-lib)
(require 'json)

(let* ((source (pop command-line-args-left))
       (output (pop command-line-args-left))
       (wanted '(melpazoid-check-sharp-quotes melpazoid-check-misc))
       (calls nil)
       (checker nil)
       (source-buffer (generate-new-buffer " *melpazoid*")))
  (with-current-buffer source-buffer
    (insert-file-contents source)
    (goto-char (point-min))
    (condition-case nil
        (while t
          (let ((form (read (current-buffer))))
            (when (and (eq (car-safe form) 'defun) (memq (nth 1 form) wanted))
              (eval form t))))
      (end-of-file nil)))
  (cl-letf (((symbol-function 'melpazoid-misc)
             (lambda (regexp msg &optional no-smart-space include-comments
                             include-strings case-insensitive exclude-pattern)
               (push `((checker . ,(symbol-name checker))
                       ,@(with-current-buffer source-buffer
                           (goto-char (point-min))
                           (when (or (search-forward (prin1-to-string regexp) nil t)
                                     (search-forward (prin1-to-string msg) nil t))
                             `((line . ,(line-number-at-pos))
                               (source . ,(string-trim
                                           (buffer-substring-no-properties
                                            (line-beginning-position)
                                            (line-end-position)))))))
                       (regexp . ,regexp)
                       (message . ,msg)
                       (noSmartSpace . ,(if no-smart-space t :json-false))
                       (includeComments . ,(if include-comments t :json-false))
                       (includeStrings . ,(if include-strings t :json-false))
                       (caseInsensitive . ,(if case-insensitive t :json-false))
                       (exclude . ,exclude-pattern))
                     calls))))
    (dolist (fn wanted)
      (setq checker fn)
      (funcall fn)))
  (with-temp-file output
    (let ((json-encoding-pretty-print t))
      (insert (json-encode (vconcat (nreverse calls))) "\n"))))

;;; melpazoid-patterns.el ends here
