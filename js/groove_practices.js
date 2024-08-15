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

	root.isIframeLoadedInsideTargetOrigin = () => {
		const isIframe = window.self !== window.top;
		const originPath = window.top.location.origin + window.top.location.pathname;
		const originUrl = originPath.substring(0, originPath.lastIndexOf('/'));
		const isParentOrigin = originUrl === root.targetOrigin;

		return !isIframe || !isParentOrigin;
	}

	root.init = () => {
		// hide save button if not iframe from targetOrigin
		if (isIframeLoadedInsideTargetOrigin) {
			root.hideSaveButton();
		}
	}

} // end of class
