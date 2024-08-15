function GroovePractices() {
	"use strict";

	var root = this;
	root.targetOrigin = 'https://leocaseiro.github.io/GroovePractices';

	root.saveGroovePractice = () => {
		// get current URL with parameters
		const parameters = {
			url: window.location.href,
			tuneTitle: document.getElementById('tuneTitle').value,
			tuneAuthor: document.getElementById('tuneAuthor').value,
			tuneComments: document.getElementById('tuneComments').value,
			message: 'saveGrooveScribe',
		};

		window.parent.postMessage(parameters, root.targetOrigin);
	};

	root.hideSaveButton = () => {
		document.getElementById('saveGroovePracticeButton').style.display = 'none';
	}

	root.init = () => {
		const isIframe = window !== window.parent;
		const isParentOrigin = window.location.origin === root.targetOrigin;

		// hide save button if not iframe from targetOrigin
		if (!isIframe || !isParentOrigin) {
			// hide save button
			root.hideSaveButton();
		}
	}

} // end of class
