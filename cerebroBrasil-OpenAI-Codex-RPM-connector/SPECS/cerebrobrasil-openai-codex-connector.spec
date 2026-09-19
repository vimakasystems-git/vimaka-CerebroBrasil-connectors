Name:           cerebrobrasil-openai-codex-connector
Version:        1.0.0
Release:        1%{?dist}
Summary:        CerebroBrasil bootstrap connector for OpenAI Codex CLI
License:        Proprietary
URL:            https://cerebrobrasil.com.br
BuildArch:      noarch
Requires:       bash
Requires:       curl
Requires:       git

%description
CerebroBrasil/Vimaka RPM connector that provides a bootstrap command for
detecting Linux and installing/updating OpenAI Codex CLI from OpenAI's
official standalone installer. The RPM contains no ChatGPT credentials.

%install
mkdir -p %{buildroot}%{_bindir}
install -m 0755 %{_sourcedir}/cerebrobrasil-codex %{buildroot}%{_bindir}/cerebrobrasil-codex

%files
%{_bindir}/cerebrobrasil-codex

%changelog
* Sat Sep 19 2026 Vimaka Systems <vimakasystems@gmail.com> - 1.0.0-1
- Initial RPM bootstrap connector
